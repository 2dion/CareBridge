import { describe, expect, it } from "vitest";
import {
  clearAllHelperHistory,
  conversationsKey,
  deleteMockConversation,
  helperHistoryKey,
  loadMockConversations,
  saveHelperHistory,
  saveMockConversation,
  type StorageLike,
  type StoredMessage,
} from "./history";

function storage(): StorageLike {
  const rows = new Map<string, string>();
  return {
    get length() {
      return rows.size;
    },
    key: (i) => [...rows.keys()][i] ?? null,
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => void rows.set(key, value),
    removeItem: (key) => void rows.delete(key),
  };
}
function pair(id: number, text: string, at = "2026-11-04T01:00:00Z"): StoredMessage[] {
  return [
    { id, from: "me", text, at },
    {
      id: id + 1,
      from: "bot",
      state: "done",
      answer: { ko: "합성 답", vi: "Trả lời", source: "교재", found: true },
    },
  ];
}

describe("W6 Mock 대화 목록 (#251)", () => {
  it("빈 대화·대기·실패 질문은 목록에 만들지 않는다", () => {
    const s = storage();
    saveMockConversation(s, "a", "empty", []);
    saveMockConversation(s, "a", "pending", [
      pair(1, "질문")[0],
      { id: 2, from: "bot", state: "loading", question: "질문" },
    ]);
    saveMockConversation(s, "a", "failed", [
      pair(1, "질문")[0],
      { id: 2, from: "bot", state: "error", question: "질문" },
    ]);
    expect(loadMockConversations(s, "a")).toEqual([]);
  });
  it("대화를 나눠 저장하고 같은 대화에 이어 물으면 제목을 유지하며 목록 맨 위로 올린다", () => {
    const s = storage();
    saveMockConversation(s, "a", "first", pair(1, "첫 질문", "2026-11-01T01:00:00Z"));
    saveMockConversation(s, "a", "second", pair(1, "둘째 대화", "2026-11-02T01:00:00Z"));
    saveMockConversation(s, "a", "first", pair(3, "이어서 질문", "2026-11-04T01:00:00Z"));
    const rows = loadMockConversations(s, "a");
    expect(rows.map((r) => r.id)).toEqual(["first", "second"]);
    expect(rows[0].title).toBe("첫 질문");
    expect(rows[0].message_count).toBe(2);
    expect(rows[0].messages).toHaveLength(4);
    expect(loadMockConversations(s, "other")).toEqual([]);
    saveMockConversation(s, "a", "first", rows[0].messages);
    expect(loadMockConversations(s, "a")[0].message_count).toBe(2);
  });
  it("베트남어와 이모지를 글자 단위 30자로 제목에 넣고 빈칸을 정리한다", () => {
    const s = storage();
    const question = "😀".repeat(31) + " Xin chào";
    saveMockConversation(s, "u", "long", pair(1, question));
    expect(loadMockConversations(s, "u")[0].title).toBe("😀".repeat(30) + "…");
    saveMockConversation(s, "u", "vi", pair(1, "  Cách\n  chăm sóc  "));
    expect(loadMockConversations(s, "u").find((r) => r.id === "vi")?.title).toBe("Cách chăm sóc");
  });
  it("기존 기록을 한국 날짜로 묶고 저장에 성공한 뒤에만 기존 키를 정리한다", () => {
    const s = storage();
    saveHelperHistory(s, "u", [
      ...pair(1, "전날", "2026-11-03T14:59:00Z"),
      ...pair(3, "다음 날", "2026-11-03T15:01:00Z"),
    ]);
    const rows = loadMockConversations(s, "u");
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe("다음 날");
    expect(rows[1].title).toBe("전날");
    expect(s.getItem(helperHistoryKey("u"))).not.toBeNull();
    saveMockConversation(s, "u", rows[0].id, pair(5, "추가"));
    expect(s.getItem(helperHistoryKey("u"))).toBeNull();
    expect(loadMockConversations(s, "u")).toHaveLength(2);
  });
  it("Mock 지우기는 지금 대화만, 로그아웃은 모든 계정 대화를 지운다", () => {
    const s = storage();
    saveMockConversation(s, "u", "a", pair(1, "첫 대화"));
    saveMockConversation(s, "u", "b", pair(1, "둘째 대화"));
    saveMockConversation(s, "v", "c", pair(1, "다른 계정"));
    deleteMockConversation(s, "u", "a");
    expect(loadMockConversations(s, "u").map((r) => r.id)).toEqual(["b"]);
    clearAllHelperHistory(s);
    expect(loadMockConversations(s, "u")).toEqual([]);
    expect(loadMockConversations(s, "v")).toEqual([]);
  });
  it("저장소가 막히거나 새 저장 값이 깨져도 멈추지 않는다", () => {
    const s = storage();
    s.setItem(conversationsKey("u"), "{broken");
    expect(loadMockConversations(s, "u")).toEqual([]);
    s.setItem(conversationsKey("u"), JSON.stringify([{ id: "broken" }]));
    expect(loadMockConversations(s, "u")).toEqual([]);
    const blocked: StorageLike = {
      ...s,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveMockConversation(blocked, "u", "a", pair(1, "질문"))).not.toThrow();
    expect(() => deleteMockConversation(blocked, "u", "a")).not.toThrow();
    expect(loadMockConversations(undefined, "u")).toEqual([]);
  });
});
