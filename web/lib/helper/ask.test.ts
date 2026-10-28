import { describe, expect, it, vi } from "vitest";

import { askHelper, NOT_FOUND, parseHelperAnswer, type HelperDeps } from "./ask";

const section = { chapter: "10장", title: "식사 돕기", page: "120", body: "억지로 권하지 않는다." };

function fakeDeps(overrides: Partial<HelperDeps> = {}): HelperDeps {
  return {
    currentUser: vi.fn(async () => ({
      id: "w1",
      role: "worker" as const,
      nativeLang: "vi" as const,
    })),
    searchManual: vi.fn(async () => [section]),
    searchGlossary: vi.fn(async () => []),
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

  it("교재·용어에서 아무것도 못 찾으면 Claude를 부르지 않고 '찾지 못했어요'", async () => {
    const deps = fakeDeps({ searchManual: vi.fn(async () => []) });
    expect(await askHelper({ question: "주식 시세" }, deps)).toEqual({
      status: 200,
      body: NOT_FOUND,
    });
    expect(deps.askClaude).not.toHaveBeenCalled();
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

  it("담당자 403, 로그인 안 함 401, 질문이 비거나 너무 길면 400", async () => {
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

describe("parseHelperAnswer", () => {
  it("found=false면 고정 문구", () => {
    expect(parseHelperAnswer('{"ko":"x","found":false}')).toEqual(NOT_FOUND);
  });
});
