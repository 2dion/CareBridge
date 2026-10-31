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
  term_vi: "hỗ trợ hoạt động thể chất",
  plain_ko: "씻기·식사·이동을 돕는 일",
  chapter: "7장",
  page: "88",
};

function fakeDeps(overrides: Partial<HelperDeps> = {}): HelperDeps {
  return {
    currentUser: vi.fn(async () => ({
      id: "w1",
      role: "worker" as const,
      nativeLang: "vi" as const,
    })),
    searchManual: vi.fn(async () => [section]),
    searchGlossary: vi.fn(async () => []),
    translateQuestion: vi.fn(async () => "밥을 안 드셔요"),
    askClaude: vi.fn(
      async () =>
        '{"ko":"억지로 권하지 마세요.","vi":"Đừng ép ăn.","source":"10장 120쪽","found":true}',
    ),
    ...overrides,
  };
}

describe("askHelper", () => {
  it("교재에서 찾은 절로 답하고 출처를 붙임", async () => {
    const deps = fakeDeps();
    const r = await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(r).toEqual({
      status: 200,
      body: { ko: "억지로 권하지 마세요.", vi: "Đừng ép ăn.", source: "10장 120쪽", found: true },
    });
    expect(vi.mocked(deps.askClaude).mock.calls[0][1]).toContain("억지로 권하지 않는다.");
  });

  it("한글이 있는 질문은 번역하지 않고 그대로 검색", async () => {
    const deps = fakeDeps();
    await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(deps.translateQuestion).not.toHaveBeenCalled();
    expect(deps.searchManual).toHaveBeenCalledWith("밥을 안 드셔요");
  });

  it("한글이 없는 질문(베트남어)은 한국어로 옮겨 검색하고, 모델에는 원문도 건넴(#122)", async () => {
    const deps = fakeDeps();
    const r = await askHelper({ question: "Cụ không chịu ăn cơm" }, deps);
    expect(deps.translateQuestion).toHaveBeenCalledWith("Cụ không chịu ăn cơm");
    expect(deps.searchManual).toHaveBeenCalledWith("밥을 안 드셔요");
    expect(deps.searchGlossary).toHaveBeenCalledWith("밥을 안 드셔요");
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
    expect(deps.searchManual).toHaveBeenCalledWith("Cụ không chịu ăn cơm");
    expect(r).toEqual({ status: 503, body: { error: "ai_not_configured" } });
  });

  it("교재·용어에서 아무것도 못 찾으면 Claude를 부르지 않고 '찾지 못했어요'", async () => {
    const deps = fakeDeps({ searchManual: vi.fn(async () => []) });
    expect(await askHelper({ question: "주식 시세" }, deps)).toEqual({
      status: 200,
      body: NOT_FOUND,
    });
    expect(deps.askClaude).not.toHaveBeenCalled();
  });

  it("모델이 found=false로 답하면 모델이 쓴 조언은 버리고 고정 문구만", async () => {
    const deps = fakeDeps({
      askClaude: vi.fn(
        async () => '{"ko":"물을 자주 드리세요.","vi":"Cho uống nước.","source":"","found":false}',
      ),
    });
    expect(await askHelper({ question: "밥" }, deps)).toEqual({ status: 200, body: NOT_FOUND });
  });

  it("건강·안전 질문(베트남어)은 모델 답에 없어도 안전 안내를 ko·vi 맨 앞에 붙임(#122)", async () => {
    const deps = fakeDeps({
      translateQuestion: vi.fn(async () => "어르신이 넘어지셨어요"),
      searchManual: vi.fn(async () => [fallSection]),
      askClaude: vi.fn(
        async () =>
          '{"ko":"바로 일으키지 마세요.","vi":"Đừng vội đỡ dậy.","source":"12장 300쪽","found":true}',
      ),
    });
    const r = await askHelper({ question: "Cụ bị ngã rồi" }, deps);
    expect(r.body).toEqual({
      ko: "관리자에게 바로 보고하세요. 바로 일으키지 마세요.",
      vi: "Hãy báo ngay cho người quản lý. Đừng vội đỡ dậy.",
      source: "12장 300쪽",
      found: true,
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
          '{"ko":"관리자에게 바로 보고하세요. 바로 일으키지 마세요.","vi":"Hãy báo ngay cho người quản lý. Đừng vội đỡ dậy.","source":"12장","found":true}',
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
    expect((await askHelper({ question: "밥" }, deps)).body.vi).toBe("");
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
  it("vi가 비어 있으면(한국어 작성자) ko에만 붙임", () => {
    expect(withSafetyNotice({ ko: "답", vi: "", source: null, found: true })).toEqual({
      ko: "관리자에게 바로 보고하세요. 답",
      vi: "",
      source: null,
      found: true,
    });
  });
});

describe("helperSystemPrompt / helperUserMessage", () => {
  it("found=false면 조언을 쓰지 말라고 지시하고, 안전 안내는 서버가 붙인다고 알림", () => {
    const system = helperSystemPrompt("vi");
    expect(system).toContain('found=false로 두고 ko·vi는 ""로 둔다');
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
  const trainee = (nativeLang: "ko" | "vi") =>
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
      askClaude: vi.fn(async () => '{"ko":"","vi":"","source":"","found":false}'),
    });
    const r = await askHelper({ question: "밥을 안 드셔요" }, deps);
    expect(r.body).toEqual({ ...notFoundAnswer(roleNames(true)), vi: "" });
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
