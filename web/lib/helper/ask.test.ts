import { describe, expect, it, vi } from "vitest";

import {
  askHelper,
  helperSystemPrompt,
  helperUserMessage,
  isSafetyQuestion,
  NOT_FOUND,
  notFoundAnswer,
  parseHelperAnswer,
  SAFETY_NOTICE,
  withSafetyNotice,
  type HelperDeps,
} from "./ask";
import { roleNames } from "@/lib/demo/roles";
import type { NativeLang } from "@/lib/i18n/languages";

const section = { chapter: "10장", title: "식사 돕기", page: "120", body: "억지로 권하지 않는다." };
const fallSection = {
  chapter: "12장",
  title: "응급상황 대처",
  page: "300",
  body: "바로 일으키지 않는다.",
};
const term = {
  matched_expression: "신체활동지원",
  term_ko: "신체활동지원",
  term_native: "hỗ trợ hoạt động thể chất",
  plain_ko: "씻기·식사·이동을 돕는 일",
  chapter: "7장",
  page: "88",
};

const SAVED = { id: "m1", created_at: "2026-10-31T01:00:00.123456+00:00" };
// 새 대화를 만든 뒤의 응답(이슈 #251). createConversation 목이 c1을 돌려준다
const CONVERSATION = { id: "c1", title: "밥을 안 드셔요" };
const SAVED_IN_NEW = { ...SAVED, conversation_id: "c1" };

function fakeDeps(overrides: Partial<HelperDeps> = {}): HelperDeps {
  return {
    currentUser: vi.fn(async () => ({
      id: "w1",
      role: "worker" as const,
      nativeLang: "vi" as const,
    })),
    searchManual: vi.fn(async () => [section]),
    searchGlossary: vi.fn(async () => []),
    translateQuestion: vi.fn(async () => ({ text: "밥을 안 드셔요", keywords: [] })),
    askClaude: vi.fn(
      async () =>
        '{"ko":"억지로 권하지 마세요.","native":"Đừng ép ăn.","source":"10장 120쪽","found":true}',
    ),
    saveMessage: vi.fn(async () => SAVED),
    findConversation: vi.fn(async (id: string) => (id === "c1" ? CONVERSATION : null)),
    createConversation: vi.fn(async (_workerId: string, title: string) => ({ id: "c1", title })),
    findSavedAnswer: vi.fn(async () => null),
    ...overrides,
  };
}

describe("askHelper", () => {
  it("교재에서 찾은 절로 답하고 출처를 붙임", async () => {
    const deps = fakeDeps();
    const r = await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(r).toEqual({
      status: 200,
      body: {
        ko: "억지로 권하지 마세요.",
        native: "Đừng ép ăn.",
        vi: "Đừng ép ăn.",
        source: "10장 120쪽",
        found: true,
        ...SAVED_IN_NEW,
      },
    });
    expect(vi.mocked(deps.askClaude).mock.calls[0][1]).toContain("억지로 권하지 않는다.");
    // 용어 검색에는 작성자 모국어를 건넨다(이슈 #259)
    expect(deps.searchGlossary).toHaveBeenCalledWith("밥을 안 드셔요", "vi");
  });

  it("옛 프롬프트대로 vi 칸으로 답해도 native로 받는다(전환 기간)", async () => {
    const deps = fakeDeps({
      askClaude: vi.fn(async () => '{"ko":"답","vi":"Trả lời","source":"1장","found":true}'),
    });
    const r = await askHelper({ question: "밥" }, deps);
    expect(r.body.native).toBe("Trả lời");
    expect(r.body.vi).toBe("Trả lời");
    expect(vi.mocked(deps.saveMessage).mock.calls[0][0].answer_native).toBe("Trả lời");
  });

  it("한글이 있는 질문은 번역하지 않고 그대로 검색", async () => {
    const deps = fakeDeps();
    await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(deps.translateQuestion).not.toHaveBeenCalled();
    expect(deps.searchManual).toHaveBeenCalledWith("밥을 안 드셔요", []);
  });

  it("한글이 없는 질문(베트남어)은 한국어로 옮겨 검색하고, 모델에는 원문도 건넴(#122)", async () => {
    const deps = fakeDeps({
      translateQuestion: vi.fn(async () => ({
        text: "밥을 안 드셔요",
        keywords: ["식사", "거부"],
      })),
    });
    const r = await askHelper({ question: "Cụ không chịu ăn cơm" }, deps);
    expect(deps.translateQuestion).toHaveBeenCalledWith("Cụ không chịu ăn cơm");
    // 번역할 때 뽑은 핵심 낱말도 교재 검색에 건넨다(이슈 #219)
    expect(deps.searchManual).toHaveBeenCalledWith("밥을 안 드셔요", ["식사", "거부"]);
    expect(deps.searchGlossary).toHaveBeenCalledWith("밥을 안 드셔요", "vi");
    const message = vi.mocked(deps.askClaude).mock.calls[0][1];
    expect(message).toContain("[질문]\n밥을 안 드셔요");
    expect(message).toContain("[질문 원문]\nCụ không chịu ăn cơm");
    expect(r.status).toBe(200);
    expect(r.body.found).toBe(true);
  });

  it("번역 키가 없으면(null) 원문 그대로 검색하고 Mock 경로(503)는 그대로", async () => {
    const deps = fakeDeps({
      translateQuestion: vi.fn(async () => null),
      askClaude: vi.fn(async () => null),
    });
    const r = await askHelper({ question: "Cụ không chịu ăn cơm" }, deps);
    expect(deps.searchManual).toHaveBeenCalledWith("Cụ không chịu ăn cơm", []);
    expect(r).toEqual({ status: 503, body: { error: "ai_not_configured" } });
  });

  it("교재·용어에서 아무것도 못 찾으면 Claude를 부르지 않고 '찾지 못했어요'", async () => {
    const deps = fakeDeps({ searchManual: vi.fn(async () => []) });
    expect(await askHelper({ question: "주식 시세" }, deps)).toEqual({
      status: 200,
      body: { ...NOT_FOUND, vi: NOT_FOUND.native, ...SAVED_IN_NEW },
    });
    expect(deps.askClaude).not.toHaveBeenCalled();
  });

  it("모델이 found=false로 답하면 모델이 쓴 조언은 버리고 고정 문구만", async () => {
    const deps = fakeDeps({
      askClaude: vi.fn(
        async () =>
          '{"ko":"물을 자주 드리세요.","native":"Cho uống nước.","source":"","found":false}',
      ),
    });
    expect(await askHelper({ question: "밥" }, deps)).toEqual({
      status: 200,
      body: { ...NOT_FOUND, vi: NOT_FOUND.native, ...SAVED_IN_NEW },
    });
  });

  it("건강·안전 질문(베트남어)은 모델 답에 없어도 안전 안내를 ko·vi 맨 앞에 붙임(#122)", async () => {
    const deps = fakeDeps({
      translateQuestion: vi.fn(async () => ({ text: "어르신이 넘어지셨어요", keywords: [] })),
      searchManual: vi.fn(async () => [fallSection]),
      askClaude: vi.fn(
        async () =>
          '{"ko":"바로 일으키지 마세요.","native":"Đừng vội đỡ dậy.","source":"12장 300쪽","found":true}',
      ),
    });
    const r = await askHelper({ question: "Cụ bị ngã rồi" }, deps);
    expect(r.body).toEqual({
      ko: "관리자에게 바로 보고하세요. 바로 일으키지 마세요.",
      native: "Hãy báo ngay cho người quản lý. Đừng vội đỡ dậy.",
      vi: "Hãy báo ngay cho người quản lý. Đừng vội đỡ dậy.",
      source: "12장 300쪽",
      found: true,
      ...SAVED_IN_NEW,
    });
  });

  it("건강·안전 질문(한국어)은 교재에 없어도 안전 안내가 먼저 붙음", async () => {
    const deps = fakeDeps({
      searchManual: vi.fn(async () => []),
      currentUser: vi.fn(async () => ({
        id: "w1",
        role: "worker" as const,
        nativeLang: "ko" as const,
      })),
    });
    const r = await askHelper({ question: "숨이 가쁘다고 하세요" }, deps);
    expect(r.body.ko).toBe(`${SAFETY_NOTICE.ko} ${NOT_FOUND.ko}`);
    expect(r.body.vi).toBe("");
    expect(r.body.found).toBe(false);
    expect(deps.askClaude).not.toHaveBeenCalled();
  });

  it("모델이 안전 안내를 이미 썼으면 두 번 붙이지 않음", async () => {
    const deps = fakeDeps({
      askClaude: vi.fn(
        async () =>
          '{"ko":"관리자에게 바로 보고하세요. 바로 일으키지 마세요.","native":"Hãy báo ngay cho người quản lý. Đừng vội đỡ dậy.","source":"12장","found":true}',
      ),
    });
    const r = await askHelper({ question: "낙상하셨어요" }, deps);
    expect(r.body.ko).toBe("관리자에게 바로 보고하세요. 바로 일으키지 마세요.");
    expect(r.body.vi).toBe("Hãy báo ngay cho người quản lý. Đừng vội đỡ dậy.");
  });

  it("안전 낱말이 없는 질문에는 안전 안내를 붙이지 않음", async () => {
    const r = await askHelper({ question: "밥을 안 드셔요" }, fakeDeps());
    expect(r.body.ko).not.toContain(SAFETY_NOTICE.ko);
  });

  it("용어의 베트남어(term_vi)를 모델에 건네고 그대로 쓰라고 지시(#122)", async () => {
    const deps = fakeDeps({ searchGlossary: vi.fn(async () => [term]) });
    await askHelper({ question: "신체활동지원이 뭐예요?" }, deps);
    const [system, message] = vi.mocked(deps.askClaude).mock.calls[0];
    expect(message).toContain("hỗ trợ hoạt động thể chất");
    expect(system).toContain("[용어]의 괄호 안 베트남어를 그대로");
    expect(system).toContain("상식·일반 조언·짐작을 보태지 않는다");
  });

  it("한국어 작성자는 vi를 비움", async () => {
    const deps = fakeDeps({
      currentUser: vi.fn(async () => ({
        id: "w1",
        role: "worker" as const,
        nativeLang: "ko" as const,
      })),
    });
    const body = (await askHelper({ question: "밥" }, deps)).body;
    expect(body.native).toBe("");
    expect(body.vi).toBe("");
  });

  it("형식이 틀리면 한 번 더, 또 틀리면 502", async () => {
    const askClaude = vi.fn(async () => "모르겠어요");
    const r = await askHelper({ question: "밥" }, fakeDeps({ askClaude }));
    expect(askClaude).toHaveBeenCalledTimes(2);
    expect(r.status).toBe(502);
  });

  it("키가 없으면 503 ai_not_configured", async () => {
    const r = await askHelper({ question: "밥" }, fakeDeps({ askClaude: vi.fn(async () => null) }));
    expect(r).toEqual({ status: 503, body: { error: "ai_not_configured" } });
  });

  it("관리자 403, 로그인 안 함 401, 질문이 비거나 너무 길면 400", async () => {
    const reviewer = fakeDeps({
      currentUser: vi.fn(async () => ({
        id: "r1",
        role: "reviewer" as const,
        nativeLang: "ko" as const,
      })),
    });
    expect((await askHelper({ question: "밥" }, reviewer)).status).toBe(403);
    expect(
      (await askHelper({ question: "밥" }, fakeDeps({ currentUser: vi.fn(async () => null) })))
        .status,
    ).toBe(401);
    expect((await askHelper({ question: " " }, fakeDeps())).status).toBe(400);
    expect((await askHelper({ question: "가".repeat(501) }, fakeDeps())).status).toBe(400);
  });
});

describe("답 저장(이슈 #218)", () => {
  it("답한 질문을 작성자·질문·답·출처와 함께 남김", async () => {
    const deps = fakeDeps();
    await askHelper({ question: "  밥을 안 드셔요 " }, deps);
    expect(deps.saveMessage).toHaveBeenCalledWith({
      worker_id: "w1",
      conversation_id: "c1",
      question: "밥을 안 드셔요",
      question_ko: "",
      answer_ko: "억지로 권하지 마세요.",
      answer_native: "Đừng ép ăn.",
      source: "10장 120쪽",
      found: true,
      safety: false,
    });
  });

  it.each(["숨쉬기", "숨 쉬기"])(
    "%s 힘들다는 질문은 교재가 없어도 보고 안내를 붙이고 저장",
    async (expression) => {
      const deps = fakeDeps({ searchManual: vi.fn(async () => []) });
      const r = await askHelper({ question: `어르신이 ${expression} 힘들다고 하세요.` }, deps);
      expect(r.status).toBe(200);
      expect(r.body.ko).toMatch(/^관리자에게 바로 보고하세요\./);
      expect(r.body.vi).toMatch(/^Hãy báo ngay cho người quản lý\./);
      expect(deps.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({ safety: true, found: false }),
      );
      expect(deps.askClaude).not.toHaveBeenCalled();
    },
  );

  it("교재에서 못 찾은 답도 남김(found=false, 출처 빈값)", async () => {
    const deps = fakeDeps({ searchManual: vi.fn(async () => []) });
    await askHelper({ question: "주식 시세" }, deps);
    expect(deps.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ answer_ko: NOT_FOUND.ko, source: "", found: false }),
    );
  });

  it("한글 없는 질문은 원문과 옮긴 한국어를 따로 남기고, 안전 안내가 붙었으면 표시함", async () => {
    const deps = fakeDeps({
      translateQuestion: vi.fn(async () => ({ text: "어르신이 넘어지셨어요", keywords: [] })),
      searchManual: vi.fn(async () => [fallSection]),
    });
    await askHelper({ question: "Cụ bị ngã rồi" }, deps);
    expect(deps.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Cụ bị ngã rồi",
        question_ko: "어르신이 넘어지셨어요",
        safety: true,
      }),
    );
    // 화면에 보인 답(안전 안내 포함) 그대로
    expect(vi.mocked(deps.saveMessage).mock.calls[0][0].answer_ko).toMatch(
      /^관리자에게 바로 보고하세요\./,
    );
  });

  it("작성자가 한국어면 모국어 답은 빈값으로 남김", async () => {
    const deps = fakeDeps({
      currentUser: vi.fn(async () => ({
        id: "k1",
        role: "worker" as const,
        nativeLang: "ko" as const,
      })),
    });
    await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(deps.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ worker_id: "k1", answer_native: "" }),
    );
  });

  it("저장이 실패해도 답은 200으로 돌려주고 id만 비움", async () => {
    const deps = fakeDeps({
      saveMessage: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await askHelper({ question: "밥을 안 드셔요" }, deps);
    spy.mockRestore();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ko: "억지로 권하지 마세요.", id: null, created_at: null });
  });

  it("401·403·400·502·503이면 저장하지 않음", async () => {
    const statusOf = async (deps: HelperDeps, body: unknown) => {
      const r = await askHelper(body, deps);
      expect(deps.saveMessage).not.toHaveBeenCalled();
      return r.status;
    };
    const reviewer = vi.fn(async () => ({
      id: "r1",
      role: "reviewer" as const,
      nativeLang: "ko" as const,
    }));
    const q = { question: "밥" };
    expect(await statusOf(fakeDeps({ currentUser: vi.fn(async () => null) }), q)).toBe(401);
    expect(await statusOf(fakeDeps({ currentUser: reviewer }), q)).toBe(403);
    expect(await statusOf(fakeDeps(), { question: "" })).toBe(400);
    expect(await statusOf(fakeDeps({ askClaude: vi.fn(async () => "형식이 아님") }), q)).toBe(502);
    expect(await statusOf(fakeDeps({ askClaude: vi.fn(async () => null) }), q)).toBe(503);
  });
});

describe("isSafetyQuestion", () => {
  it("한국어·베트남어 안전 낱말을 찾음(대소문자·결합 문자 무관)", () => {
    expect(isSafetyQuestion("어르신이 넘어지셨어요")).toBe(true);
    expect(isSafetyQuestion("약을 두 번 드셨어요")).toBe(true);
    expect(isSafetyQuestion("Cụ bị NGÃ")).toBe(true);
    expect(isSafetyQuestion("Cụ kêu đau bụng")).toBe(true);
    expect(isSafetyQuestion("Cụ khó thở".normalize("NFD"))).toBe(true);
    expect(isSafetyQuestion("Cụ uống thuốc hai lần")).toBe(true);
    // 질식·사레·목에 걸림(이슈 #220)
    expect(isSafetyQuestion("어르신이 식사 중에 질식한 것 같아요")).toBe(true);
    expect(isSafetyQuestion("사레가 들려서 기침을 하세요")).toBe(true);
    expect(isSafetyQuestion("음식이 목에 걸렸어요")).toBe(true);
    expect(isSafetyQuestion("Cụ bị nghẹn khi ăn")).toBe(true);
    expect(isSafetyQuestion("Cụ bị nghẹt thở khi ăn")).toBe(true);
    expect(isSafetyQuestion("Cụ bị sặc nước")).toBe(true);
  });

  it("일상 질문은 안전 질문이 아님", () => {
    expect(isSafetyQuestion("밥을 안 드셔요")).toBe(false);
    expect(isSafetyQuestion("Cụ không chịu ăn cơm")).toBe(false);
    expect(isSafetyQuestion("Hỗ trợ hoạt động thể chất là gì?")).toBe(false);
  });
});

describe("withSafetyNotice", () => {
  it("native가 비어 있으면(한국어 작성자) ko에만 붙임", () => {
    expect(withSafetyNotice({ ko: "답", native: "", source: null, found: true })).toEqual({
      ko: "관리자에게 바로 보고하세요. 답",
      native: "",
      source: null,
      found: true,
    });
  });
});

describe("helperSystemPrompt / helperUserMessage", () => {
  it("found=false면 조언을 쓰지 말라고 지시하고, 안전 안내는 서버가 붙인다고 알림", () => {
    const system = helperSystemPrompt("vi");
    expect(system).toContain('found=false로 두고 ko·native는 ""로 둔다');
    expect(system).toContain("native에는 ko의 베트남어 번역을 쓴다");
    expect(system).toContain("건강·안전 보고 안내는 서버가 붙이므로 쓰지 않는다");
  });

  it("원문과 번역이 같으면 [질문 원문]을 넣지 않음", () => {
    expect(helperUserMessage("밥", [], [], "밥")).not.toContain("[질문 원문]");
    expect(helperUserMessage("밥", [], [])).not.toContain("[질문 원문]");
  });
});

describe("parseHelperAnswer", () => {
  it("found=false면 고정 문구", () => {
    expect(parseHelperAnswer('{"ko":"x","found":false}')).toEqual(NOT_FOUND);
  });
});

describe("교육용 기관 고정 안내(이슈 #180)", () => {
  const trainee = (nativeLang: NativeLang) =>
    vi.fn(async () => ({ id: "t1", role: "worker" as const, nativeLang, isTraining: true }));

  it("교재에서 못 찾으면 '강사에게 물어보세요'", async () => {
    const deps = fakeDeps({ searchManual: vi.fn(async () => []), currentUser: trainee("vi") });
    const r = await askHelper({ question: "밥" }, deps);
    expect(r.body.ko).toBe("교재에서 찾지 못했어요. 강사에게 물어보세요.");
    expect(r.body.vi).toContain("giảng viên");
    expect(JSON.stringify(r.body)).not.toMatch(/관리자|người quản lý/);
  });

  it("모델이 found=false로 답해도 '강사'", async () => {
    const deps = fakeDeps({
      currentUser: trainee("ko"),
      askClaude: vi.fn(async () => '{"ko":"","native":"","source":"","found":false}'),
    });
    const r = await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(r.body).toEqual({
      ...notFoundAnswer(roleNames(true)),
      native: "",
      vi: "",
      ...SAVED_IN_NEW,
    });
  });

  it("건강·안전 질문은 '강사에게 바로 보고하세요'", async () => {
    const deps = fakeDeps({ searchManual: vi.fn(async () => []), currentUser: trainee("vi") });
    const r = await askHelper({ question: "어르신이 넘어지셨어요" }, deps);
    expect(r.body.ko).toBe(
      "강사에게 바로 보고하세요. 교재에서 찾지 못했어요. 강사에게 물어보세요.",
    );
    expect(String(r.body.vi).startsWith("Hãy báo ngay cho giảng viên.")).toBe(true);
  });

  it("일반 기관은 그대로 '관리자'", async () => {
    const deps = fakeDeps({ searchManual: vi.fn(async () => []) });
    const r = await askHelper({ question: "넘어지셨어요" }, deps);
    expect(r.body.ko).toBe(`${SAFETY_NOTICE.ko} ${NOT_FOUND.ko}`);
    expect(SAFETY_NOTICE.ko).toBe("관리자에게 바로 보고하세요.");
  });
});

describe("도우미 대화 묶음(이슈 #251)", () => {
  it("conversation_id 없이 물으면 첫 질문 앞 30자로 새 대화를 만들고 그 대화에 저장", async () => {
    const deps = fakeDeps();
    const r = await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(r.body.conversation_id).toBe("c1");
    expect(deps.findConversation).not.toHaveBeenCalled();
    expect(deps.createConversation).toHaveBeenCalledWith("w1", "밥을 안 드셔요");
    expect(vi.mocked(deps.saveMessage).mock.calls[0][0].conversation_id).toBe("c1");
  });

  it("긴 첫 질문은 제목을 30자 + '…'로", async () => {
    const deps = fakeDeps();
    await askHelper({ question: `${"가".repeat(40)}` }, deps);
    expect(vi.mocked(deps.createConversation).mock.calls[0][1]).toBe(`${"가".repeat(30)}…`);
  });

  it("conversation_id를 보내면 내 대화인지 확인하고 그 대화에 붙임(새 대화 없음)", async () => {
    const deps = fakeDeps();
    const r = await askHelper({ question: "밥을 안 드셔요", conversation_id: "c1" }, deps);
    expect(r.status).toBe(200);
    expect(r.body.conversation_id).toBe("c1");
    expect(deps.findConversation).toHaveBeenCalledWith("c1", "w1");
    expect(deps.createConversation).not.toHaveBeenCalled();
    expect(vi.mocked(deps.saveMessage).mock.calls[0][0].conversation_id).toBe("c1");
  });

  it("남의 대화(없는 대화)면 404이고 답을 만들지도 저장하지도 않음", async () => {
    const deps = fakeDeps();
    expect(await askHelper({ question: "밥", conversation_id: "c9" }, deps)).toEqual({
      status: 404,
      body: { error: "conversation_not_found" },
    });
    expect(deps.askClaude).not.toHaveBeenCalled();
    expect(deps.saveMessage).not.toHaveBeenCalled();
  });

  it("새 대화를 만들지 못하면 답은 주되 저장하지 않고 conversation_id·id는 null", async () => {
    const deps = fakeDeps({
      createConversation: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const r = await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(r.status).toBe(200);
    expect(r.body.ko).toBe("억지로 권하지 마세요.");
    expect(r.body.conversation_id).toBeNull();
    expect(r.body.id).toBeNull();
    expect(deps.saveMessage).not.toHaveBeenCalled();
  });
});

describe("같은 질문 재사용(이슈 #229)", () => {
  const stored = {
    ko: "억지로 권하지 마세요.",
    native: "Đừng ép ăn.",
    source: "10장 120쪽",
    found: true,
  };

  it("저장된 답이 있으면 Claude·교재 검색 없이 그 답을 주고 이번 질문도 저장", async () => {
    const deps = fakeDeps({ findSavedAnswer: vi.fn(async () => stored) });
    const r = await askHelper({ question: "어르신이 밥을 안 드셔요?" }, deps);
    expect(r.status).toBe(200);
    expect(r.body.ko).toBe(stored.ko);
    expect(r.body.native).toBe(stored.native);
    expect(r.body.source).toBe("10장 120쪽");
    expect(deps.findSavedAnswer).toHaveBeenCalledWith("w1", "어르신이 밥을 안 드셔요?");
    expect(deps.askClaude).not.toHaveBeenCalled();
    expect(deps.searchManual).not.toHaveBeenCalled();
    expect(vi.mocked(deps.saveMessage).mock.calls[0][0]).toMatchObject({
      question: "어르신이 밥을 안 드셔요?",
      answer_ko: stored.ko,
      found: true,
    });
  });

  it("베트남어 질문은 옮긴 한국어로 저장된 답을 찾는다", async () => {
    const deps = fakeDeps({ findSavedAnswer: vi.fn(async () => stored) });
    await askHelper({ question: "Cụ không chịu ăn cơm" }, deps);
    expect(deps.findSavedAnswer).toHaveBeenCalledWith("w1", "밥을 안 드셔요");
  });

  it("재사용한 답에도 건강·안전 안내를 붙인다(두 번 붙이지 않음)", async () => {
    const withNotice = {
      ...stored,
      ko: `${SAFETY_NOTICE.ko} 바로 일으키지 마세요.`,
      native: `${SAFETY_NOTICE.native} Đừng vội đỡ dậy.`,
    };
    const deps = fakeDeps({ findSavedAnswer: vi.fn(async () => withNotice) });
    const r = await askHelper({ question: "어르신이 넘어지셨어요" }, deps);
    expect(r.body.ko).toBe(withNotice.ko);
    expect(String(r.body.ko).split(SAFETY_NOTICE.ko)).toHaveLength(2);
  });

  it("저장된 답이 없으면 지금처럼 교재를 검색해 Claude를 부른다", async () => {
    const deps = fakeDeps();
    await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(deps.findSavedAnswer).toHaveBeenCalled();
    expect(deps.askClaude).toHaveBeenCalledTimes(1);
  });
});

describe("교재 문단만 보내기(이슈 #229)", () => {
  it("질문 낱말이 든 문단과 앞뒤 문단만 보내고 절당 1,500자를 넘지 않는다", () => {
    const long = {
      chapter: "10장",
      title: "식사 돕기",
      page: "120",
      body: [
        "첫 문단 안내",
        "식사를 거부하면 억지로 권하지 않는다.",
        "셋째 문단",
        "넷째 문단",
        "가".repeat(2000),
      ].join("\n"),
    };
    const message = helperUserMessage("식사 거부", [long], []);
    expect(message).toContain("억지로 권하지 않는다");
    expect(message).toContain("첫 문단 안내");
    expect(message).toContain("셋째 문단");
    expect(message).not.toContain("넷째 문단");
    expect(message).not.toContain("가".repeat(1600));
    expect(message).toContain("10장 식사 돕기 (120쪽)");
  });

  it("핵심 낱말(keywords)로도 문단을 고른다", () => {
    const section = {
      chapter: "12장",
      title: "응급",
      page: "300",
      body: ["소개 문단", "넘김 문단", "건너뜀 문단", "호흡이 멈추면 119.", "마지막"].join("\n"),
    };
    const message = helperUserMessage("숨쉬기 힘들다", [section], [], undefined, ["호흡"]);
    expect(message).toContain("호흡이 멈추면 119.");
    expect(message).not.toContain("소개 문단");
  });

  it("답 길이를 3문장 이내로 지시한다", () => {
    expect(helperSystemPrompt("vi")).toContain("3문장 이내");
  });
});
