import { describe, expect, it, vi } from "vitest";

import {
  agentSystemPrompt,
  AUTO_STOP_REASON,
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
  it("확인 요청 문장은 value_ko가 아니라 reason에만 쓰라고 함 (이슈 #117)", () => {
    const prompt = agentSystemPrompt("home", "vi");
    expect(prompt).toContain("확인 요청·질문 문장은 value_ko에 넣지 않고 reason에만 쓴다");
  });
});
