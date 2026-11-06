import { describe, expect, it, vi } from "vitest";

import { type HelperMessagesDeps, listHelperMessages, type StoredHelperRow } from "./messages";

const LATEST = { id: "c1", title: "질문 1" };

// 최근 것이 먼저(내림차순)로 n개 만든다. created_at은 1분씩 앞선다
function rows(n: number): StoredHelperRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${n - i}`,
    question: `질문 ${n - i}`,
    answer_ko: `답 ${n - i}`,
    answer_native: `Trả lời ${n - i}`,
    native_lang: "vi",
    source: i === 0 ? "" : "10장 120쪽",
    found: i !== 0,
    created_at: `2026-10-31T01:${String(59 - i).padStart(2, "0")}:00.123456+00:00`,
  }));
}

function fakeDeps(overrides: Partial<HelperMessagesDeps> = {}): HelperMessagesDeps {
  return {
    currentUser: vi.fn(async () => ({ id: "w1", role: "worker" as const })),
    findConversation: vi.fn(async (id: string) => (id === "c1" ? LATEST : null)),
    latestConversation: vi.fn(async () => LATEST),
    fetchMessages: vi.fn(async () => rows(2)),
    ...overrides,
  };
}

const params = (query = "") => new URLSearchParams(query);

describe("listHelperMessages의 답 언어(이슈 #354)", () => {
  it.each(["vi", "zh", "mn", "en", "ko"])(
    "저장된 native_lang %s를 그대로 내려 주고 vi 키는 없다",
    async (lang) => {
      const deps = fakeDeps({
        fetchMessages: vi.fn(async () => rows(1).map((row) => ({ ...row, native_lang: lang }))),
      });
      const r = await listHelperMessages(params(), deps);
      const answer = (r.body.messages as Array<{ answer: Record<string, unknown> }>)[0].answer;
      expect(answer.native_lang).toBe(lang);
      expect(answer.native).toBe("Trả lời 1");
      expect(answer).not.toHaveProperty("vi");
    },
  );

  it("모르는 언어 값은 ko로 읽는다", async () => {
    const deps = fakeDeps({
      fetchMessages: vi.fn(async () => rows(1).map((row) => ({ ...row, native_lang: "xx" }))),
    });
    const r = await listHelperMessages(params(), deps);
    expect(
      (r.body.messages as Array<{ answer: { native_lang: string } }>)[0].answer.native_lang,
    ).toBe("ko");
  });
});

describe("listHelperMessages", () => {
  it("내 대화를 오래된 것부터 돌려주고 더 이전이 없으면 next_before가 null", async () => {
    const deps = fakeDeps();
    const r = await listHelperMessages(params(), deps);
    expect(r.status).toBe(200);
    expect(r.body.conversation).toEqual(LATEST);
    expect(r.body.next_before).toBeNull();
    const messages = r.body.messages as Array<{ id: string }>;
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    // 가장 최근(i=0)은 교재에서 못 찾은 답: 출처는 null
    expect(messages[1]).toEqual({
      id: "m2",
      question: "질문 2",
      answer: { ko: "답 2", native: "Trả lời 2", native_lang: "vi", source: null, found: false },
      created_at: "2026-10-31T01:59:00.123456+00:00",
    });
    // 기본 50개 + 더 있는지 보려고 1개 더
    expect(deps.fetchMessages).toHaveBeenCalledWith("c1", null, 51);
  });

  it("limit보다 많으면 가장 오래된 행의 created_at을 next_before로 줌", async () => {
    const deps = fakeDeps({ fetchMessages: vi.fn(async () => rows(4)) });
    const r = await listHelperMessages(params("limit=3"), deps);
    const messages = r.body.messages as Array<{ id: string; created_at: string }>;
    expect(messages.map((m) => m.id)).toEqual(["m2", "m3", "m4"]);
    expect(r.body.next_before).toBe(messages[0].created_at);
    expect(deps.fetchMessages).toHaveBeenCalledWith("c1", null, 4);
  });

  it("before를 문자열 그대로 넘김(마이크로초 유지)", async () => {
    const deps = fakeDeps();
    const before = "2026-10-31T01:30:00.123456+00:00";
    await listHelperMessages(params(`before=${encodeURIComponent(before)}&limit=100`), deps);
    expect(deps.fetchMessages).toHaveBeenCalledWith("c1", before, 101);
  });

  it("로그인 안 함 401, 작성자가 아니면 403이고 DB를 읽지 않음", async () => {
    const out = fakeDeps({ currentUser: vi.fn(async () => null) });
    expect((await listHelperMessages(params(), out)).status).toBe(401);
    expect(out.fetchMessages).not.toHaveBeenCalled();
    const reviewer = fakeDeps({
      currentUser: vi.fn(async () => ({ id: "r1", role: "reviewer" as const })),
    });
    const r = await listHelperMessages(params(), reviewer);
    expect(r).toEqual({ status: 403, body: { error: "not_record_worker" } });
    expect(reviewer.fetchMessages).not.toHaveBeenCalled();
  });

  it.each(["limit=0", "limit=101", "limit=abc", "limit=-1", "before=어제", "before=2026-13-45"])(
    "잘못된 입력 %s은 400",
    async (query) => {
      const deps = fakeDeps();
      const r = await listHelperMessages(params(query), deps);
      expect(r).toEqual({ status: 400, body: { error: "invalid_input" } });
      expect(deps.fetchMessages).not.toHaveBeenCalled();
    },
  );

  it("대화에 질문이 없으면 빈 목록", async () => {
    const deps = fakeDeps({ fetchMessages: vi.fn(async () => []) });
    const r = await listHelperMessages(params(), deps);
    expect(r).toEqual({
      status: 200,
      body: { conversation: LATEST, messages: [], next_before: null },
    });
  });

  it("대화가 하나도 없으면 conversation이 null이고 질문을 읽지 않음(이슈 #251)", async () => {
    const deps = fakeDeps({ latestConversation: vi.fn(async () => null) });
    const r = await listHelperMessages(params(), deps);
    expect(r).toEqual({
      status: 200,
      body: { conversation: null, messages: [], next_before: null },
    });
    expect(deps.fetchMessages).not.toHaveBeenCalled();
  });

  it("conversation_id를 보내면 그 대화를 읽고, 남의 것이거나 없으면 404(이슈 #251)", async () => {
    const deps = fakeDeps();
    const r = await listHelperMessages(params("conversation_id=c1"), deps);
    expect(r.status).toBe(200);
    expect(deps.findConversation).toHaveBeenCalledWith("c1", "w1");
    expect(deps.latestConversation).not.toHaveBeenCalled();
    expect(deps.fetchMessages).toHaveBeenCalledWith("c1", null, 51);

    const other = fakeDeps();
    expect(await listHelperMessages(params("conversation_id=c9"), other)).toEqual({
      status: 404,
      body: { error: "conversation_not_found" },
    });
    expect(other.fetchMessages).not.toHaveBeenCalled();
  });
});
