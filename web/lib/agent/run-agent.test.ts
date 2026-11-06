import { describe, expect, it, vi } from "vitest";

import {
  AGENT_TOOLS,
  agentSystemPrompt,
  AUTO_STOP_REASON,
  normalizeDraftInput,
  runAgent,
  type AgentDeps,
  type AgentInput,
  type ContentBlock,
} from "./run-agent";
import { ITEM_KEYS, type Draft } from "./validate-draft";

const transcript = "점심은 죽 반 넘게 드셨어요.";

const emptyDraft: Draft = {
  transcript_ko: transcript,
  items: ITEM_KEYS.map((key) => ({
    item_key: key,
    value_ko: "",
    value_native: "",
    status: "not_mentioned",
    evidence: "",
    reason: "",
    reason_native: "",
    detail: {},
  })),
  form_fields: {},
};

const input: AgentInput = {
  transcript,
  careType: "facility",
  nativeLang: "vi",
  context: { transcript, careType: "facility", nativeLang: "vi", blockedNames: [] },
};

let id = 0;
const use = (name: string, args: Record<string, unknown>): ContentBlock => ({
  type: "tool_use",
  id: `t${++id}`,
  name,
  input: { why: `${name} 이유`, ...args },
});

function fakeDeps(replies: ContentBlock[][], overrides: Partial<AgentDeps> = {}): AgentDeps {
  const queue = [...replies];
  return {
    callClaude: vi.fn(async () => ({ content: queue.shift() ?? [], tokens: 100 })),
    searchGlossary: vi.fn(async () => [{ term_ko: "섭취량" }]),
    saveDraft: vi.fn(async () => ({ downgraded: [] })),
    logStep: vi.fn(async () => {}),
    now: () => 0,
    ...overrides,
  };
}

describe("runAgent", () => {
  it("흔한 3번 응답: 도구를 실행하고 return_draft로 끝냄", async () => {
    const deps = fakeDeps([
      [
        use("get_form_spec", { care_type: "facility" }),
        use("search_glossary", { expression: "죽" }),
      ],
      [use("validate_draft", { draft: emptyDraft })],
      [use("return_draft", { draft: emptyDraft })],
    ]);
    const result = await runAgent(input, deps);
    expect(result.endReason).toBe("draft_returned");
    expect(deps.saveDraft).toHaveBeenCalledWith(emptyDraft);
    expect(deps.callClaude).toHaveBeenCalledTimes(3);
    // 도구 호출마다 작업 기록 한 줄, why가 reason으로
    expect(deps.logStep).toHaveBeenCalledTimes(4);
    expect(deps.logStep).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ step_no: 1, tool: "get_form_spec", reason: "get_form_spec 이유" }),
    );
  });

  it("같은 도구·같은 입력은 다시 실행하지 않고 앞 결과를 돌려줌", async () => {
    const deps = fakeDeps([
      [use("search_glossary", { expression: "죽" })],
      [use("search_glossary", { expression: "죽" })],
      [use("return_draft", { draft: emptyDraft })],
    ]);
    await runAgent(input, deps);
    expect(deps.searchGlossary).toHaveBeenCalledTimes(1);
    expect(deps.logStep).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ result_summary: "같은 입력 반복: 앞 결과를 돌려줌" }),
    );
  });

  it("응답은 최대 4번. return_draft가 없으면 마지막 초안을 저장하고 auto_stopped", async () => {
    const replies = Array.from({ length: 6 }, () => [use("validate_draft", { draft: emptyDraft })]);
    const deps = fakeDeps(replies);
    const result = await runAgent(input, deps);
    expect(deps.callClaude).toHaveBeenCalledTimes(4);
    expect(result.endReason).toBe("auto_stopped");
    expect(deps.saveDraft).toHaveBeenCalledTimes(1);
  });

  it("3번째 응답의 도구 결과에 return_draft 안내를 덧붙임", async () => {
    const deps = fakeDeps(
      Array.from({ length: 4 }, (_, i) => [use("search_glossary", { expression: `말${i}` })]),
    );
    await runAgent(input, deps);
    // messages: [받아쓴 글, 응답1, 결과1, 응답2, 결과2, 응답3, 결과3, ...]
    const messages = vi.mocked(deps.callClaude).mock.calls[3][1];
    const third = messages[6].content as { content: string }[];
    expect(third[0].content).toContain("다음 응답에서 return_draft를 불러야 함");
  });

  it("초안이 아예 없이 멈추면 9개 모두 '확인 필요' + 자동 정리 중단", async () => {
    const deps = fakeDeps([[{ type: "text", text: "끝" }]]);
    await runAgent(input, deps);
    const saved = vi.mocked(deps.saveDraft).mock.calls[0][0] as Draft;
    expect(saved.items).toHaveLength(9);
    expect(
      saved.items.every((i) => i.status === "needs_check" && i.reason === AUTO_STOP_REASON),
    ).toBe(true);
  });

  it("형식이 깨진 return_draft는 저장하지 않고 문제 목록을 돌려줌", async () => {
    const deps = fakeDeps([
      [use("return_draft", { draft: { items: [] } })],
      [use("return_draft", { draft: emptyDraft })],
    ]);
    const result = await runAgent(input, deps);
    expect(result.endReason).toBe("draft_returned");
    expect(deps.saveDraft).toHaveBeenCalledTimes(1);
  });

  it("도구가 두 번 실패하면 예외로 끝냄(처리 실패)", async () => {
    const searchGlossary = vi.fn(async () => {
      throw new Error("timeout");
    });
    const deps = fakeDeps([[use("search_glossary", { expression: "죽" })]], { searchGlossary });
    await expect(runAgent(input, deps)).rejects.toThrow("tool_failed: search_glossary");
    expect(searchGlossary).toHaveBeenCalledTimes(2);
  });
});

describe("agentSystemPrompt", () => {
  // 이슈 #362: 모국어로 받아쓴 낱말도 용어 목록에서 찾고, 찾은 용어는 짐작으로 보지 않는다
  it("모국어 낱말을 그대로 검색하고, 교재 용어로 돌아오면 짐작이 아니라고 함", () => {
    const prompt = agentSystemPrompt("facility", "mn");
    expect(prompt).toContain("모국어 낱말을 search_glossary가 교재 용어로 돌려주면");
    expect(prompt).toContain("이것은 짐작이 아니다");
    const tool = AGENT_TOOLS.find((t) => t.name === "search_glossary");
    expect(tool?.description).toContain("받아쓴 글이 모국어면 그 낱말");
    expect(tool?.description).toContain("한국어 표현과 작성자 모국어 고정 번역 양쪽에서 찾는다");
  });

  it("이유 번역에 한국어를 섞지 않고, 누가 확인하라는 말을 붙이지 않게 함 (이슈 #362)", () => {
    const prompt = agentSystemPrompt("facility", "mn");
    expect(prompt).toContain(
      "reason_native는 작성자 모국어로만 쓰고 한국어 낱말을 괄호로 덧붙이지 않는다",
    );
    expect(prompt).toContain("누가 확인하라는 말을 붙이지 않는다");
  });

  it("확인 요청 문장은 value_ko가 아니라 reason에만 쓰라고 함 (이슈 #117)", () => {
    const prompt = agentSystemPrompt("home", "vi");
    expect(prompt).toContain("확인 요청·질문 문장은 value_ko에 넣지 않고 reason에만 쓴다");
  });

  it("재가 숫자 칸(방문 시각·지원별 분)은 말한 숫자를 채우고 말하지 않은 것은 비우라고 함 (이슈 #115)", () => {
    const prompt = agentSystemPrompt("home", "vi");
    expect(prompt).toContain("visit_time.detail.start·end");
    expect(prompt).toContain("form_fields.total_minutes");
    expect(prompt).toContain("support.detail.minutes");
    expect(prompt).toContain("말하지 않은 숫자는 지어내지 않고 비운다");
  });

  // 이슈 #121: 용어 검색이 비어도 일상 표현은 기록체로, 특이사항 지어내기 금지, 번역은 성별 중립
  it("용어 검색 결과가 비어도 뜻이 분명한 일상 표현은 observed로 두라고 함", () => {
    const prompt = agentSystemPrompt("home", "vi");
    expect(prompt).toContain('"용어 검색 결과 없음"만으로 needs_check로 두지 않는다');
    expect(prompt).not.toContain("search_glossary 결과가 비었거나");
    const tool = AGENT_TOOLS.find((t) => t.name === "search_glossary");
    expect(tool?.description).toContain("결과가 비어도 뜻이 분명한 일상 표현은");
    expect(tool?.description).not.toContain("그 항목을 needs_check로 둔다");
  });

  it("특이사항·다음 확인사항을 지어내지 말고, 번역에 성별을 정하지 말라고 함", () => {
    const prompt = agentSystemPrompt("facility", "vi");
    expect(prompt).toContain("notes(특이사항)와 next_check(다음 확인사항)도 같다");
    // 이슈 #205: 건강·안전 신호만 특이사항에도 쓴다(AI 규칙 v1.1.5 확인 필요 4번)
    expect(prompt).toContain("notes에도 그 사실만 짧게 쓴다");
    expect(prompt).toContain("성별을 정하지 않는다");
    expect(prompt).toContain("ông/bà");
  });
});

describe("draft가 문자열로 올 때 (이슈 #356)", () => {
  it("유효한 JSON 객체 문자열은 객체로 읽어 검증하고 객체로 저장함", async () => {
    const deps = fakeDeps([[use("return_draft", { draft: JSON.stringify(emptyDraft) })]]);
    const result = await runAgent(input, deps);
    expect(result.endReason).toBe("draft_returned");
    expect(deps.saveDraft).toHaveBeenCalledWith(emptyDraft);
  });

  it("validate_draft도 객체 문자열을 통과시킴", async () => {
    const deps = fakeDeps([[use("validate_draft", { draft: JSON.stringify(emptyDraft) })]]);
    await runAgent(input, deps);
    const summary = vi.mocked(deps.logStep).mock.calls[0][0].result_summary;
    expect(summary).toContain('"passed":true');
    expect(summary).not.toContain("진단");
  });

  it("읽을 수 없는 문자열은 저장하지 않고, 진단에는 타입만 남김(본문 없음)", async () => {
    const deps = fakeDeps([[use("return_draft", { draft: "비밀 본문 {깨진 json" })], []], {
      callClaude: vi
        .fn()
        .mockResolvedValueOnce({
          content: [use("return_draft", { draft: "비밀 본문 {깨진 json" })],
          tokens: 100,
          cacheReadTokens: 1234,
        })
        .mockResolvedValue({ content: [], tokens: 1 }),
    });
    await runAgent(input, deps);
    const firstSave = vi.mocked(deps.saveDraft).mock.calls[0][0] as { items: { reason: string }[] };
    // 형식 오류 초안은 return_draft로 저장되지 않고, 끝에 자동 정리 중단 초안만 저장된다
    expect(firstSave.items.every((item) => item.reason === AUTO_STOP_REASON)).toBe(true);
    const summary = vi.mocked(deps.logStep).mock.calls[0][0].result_summary;
    expect(summary).toContain('"saved":false');
    expect(summary).toContain(
      '"draft_type":"string","parsed_from_string":false,"items_is_array":false,"cache_read_tokens":1234',
    );
  });

  it("normalizeDraftInput: 객체는 그대로, 객체가 아닌 JSON은 문자열 그대로", () => {
    expect(normalizeDraftInput(emptyDraft)).toBe(emptyDraft);
    expect(normalizeDraftInput('{"a":1}')).toEqual({ a: 1 });
    expect(normalizeDraftInput("[1]")).toBe("[1]");
    expect(normalizeDraftInput("3")).toBe("3");
    expect(normalizeDraftInput(null)).toBeNull();
  });
});
