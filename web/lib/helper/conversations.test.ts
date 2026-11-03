import { describe, expect, it, vi } from "vitest";

import {
  conversationTitle,
  type HelperConversationsDeps,
  listHelperConversations,
  type StoredConversationRow,
} from "./conversations";

// 최근 것이 먼저(내림차순)로 n개 만든다. last_message_at은 1분씩 앞선다
function rows(n: number): StoredConversationRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${n - i}`,
    title: `대화 ${n - i}`,
    last_message_at: `2026-11-03T01:${String(59 - i).padStart(2, "0")}:00.123456+00:00`,
    message_count: n - i,
  }));
}

function fakeDeps(overrides: Partial<HelperConversationsDeps> = {}): HelperConversationsDeps {
  return {
    currentUser: vi.fn(async () => ({ id: "w1", role: "worker" as const })),
    fetchConversations: vi.fn(async () => rows(2)),
    ...overrides,
  };
}

const params = (query = "") => new URLSearchParams(query);

describe("conversationTitle", () => {
  it("첫 질문 앞 30자, 넘으면 '…', 줄바꿈·연속 빈칸은 빈칸 하나", () => {
    expect(conversationTitle("  밥을   안\n드셔요 ")).toBe("밥을 안 드셔요");
    expect(conversationTitle("가".repeat(31))).toBe(`${"가".repeat(30)}…`);
    expect(conversationTitle("가".repeat(30))).toBe("가".repeat(30));
    // 글자 수는 코드 포인트로 센다(베트남어 결합 문자가 잘리지 않게)
    expect(conversationTitle("Cụ không chịu ăn cơm, phải làm sao ạ?")).toBe(
      "Cụ không chịu ăn cơm, phải làm…",
    );
  });
});

describe("listHelperConversations", () => {
  it("내 대화를 최근 것부터 돌려주고 더 이전이 없으면 next_before가 null", async () => {
    const deps = fakeDeps();
    const r = await listHelperConversations(params(), deps);
    expect(r).toEqual({
      status: 200,
      body: {
        conversations: [
          {
            id: "c2",
            title: "대화 2",
            last_message_at: "2026-11-03T01:59:00.123456+00:00",
            message_count: 2,
          },
          {
            id: "c1",
            title: "대화 1",
            last_message_at: "2026-11-03T01:58:00.123456+00:00",
            message_count: 1,
          },
        ],
        next_before: null,
      },
    });
    // 기본 20개 + 더 있는지 보려고 1개 더
    expect(deps.fetchConversations).toHaveBeenCalledWith("w1", null, 21);
  });

  it("limit보다 많으면 마지막 대화의 last_message_at을 next_before로 줌", async () => {
    const deps = fakeDeps({ fetchConversations: vi.fn(async () => rows(4)) });
    const r = await listHelperConversations(params("limit=3"), deps);
    const list = r.body.conversations as Array<{ id: string; last_message_at: string }>;
    expect(list.map((c) => c.id)).toEqual(["c4", "c3", "c2"]);
    expect(r.body.next_before).toBe(list[2].last_message_at);
  });

  it("before를 문자열 그대로 넘김", async () => {
    const deps = fakeDeps();
    const before = "2026-11-03T01:30:00.123456+00:00";
    await listHelperConversations(params(`before=${encodeURIComponent(before)}&limit=50`), deps);
    expect(deps.fetchConversations).toHaveBeenCalledWith("w1", before, 51);
  });

  it("로그인 안 함 401, 작성자가 아니면 403", async () => {
    const out = fakeDeps({ currentUser: vi.fn(async () => null) });
    expect((await listHelperConversations(params(), out)).status).toBe(401);
    const reviewer = fakeDeps({
      currentUser: vi.fn(async () => ({ id: "r1", role: "reviewer" as const })),
    });
    expect(await listHelperConversations(params(), reviewer)).toEqual({
      status: 403,
      body: { error: "not_record_worker" },
    });
    expect(reviewer.fetchConversations).not.toHaveBeenCalled();
  });

  it.each(["limit=0", "limit=51", "limit=abc", "before=어제"])(
    "잘못된 입력 %s은 400",
    async (query) => {
      const deps = fakeDeps();
      expect(await listHelperConversations(params(query), deps)).toEqual({
        status: 400,
        body: { error: "invalid_input" },
      });
      expect(deps.fetchConversations).not.toHaveBeenCalled();
    },
  );

  it("대화가 없으면 빈 목록", async () => {
    const deps = fakeDeps({ fetchConversations: vi.fn(async () => []) });
    expect(await listHelperConversations(params(), deps)).toEqual({
      status: 200,
      body: { conversations: [], next_before: null },
    });
  });
});
