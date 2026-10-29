import { describe, expect, it } from "vitest";

import {
  clearAllHelperHistory,
  clearHelperHistory,
  forStorage,
  HELPER_HISTORY_LIMIT,
  helperHistoryKey,
  loadHelperHistory,
  saveHelperHistory,
  type StoredMessage,
  type StorageLike,
  trimHistory,
} from "./history";

/** 브라우저 없는 테스트용 저장소 */
function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const answer = { ko: "답", vi: "Trả lời", source: "1장 2절", found: true };
const me = (id: number): StoredMessage => ({
  id,
  from: "me",
  text: `질문 ${id}`,
  at: "2026-10-29T10:00:00+09:00",
});
const done = (id: number): StoredMessage => ({ id, from: "bot", state: "done", answer });

describe("W6 도우미 대화 브라우저 저장 (이슈 #152)", () => {
  it("계정별 키에 저장하고 그대로 다시 읽는다(질문·답·출처)", () => {
    const storage = fakeStorage();
    saveHelperHistory(storage, "user-a", [me(1), done(2)]);
    expect(storage.data.has(helperHistoryKey("user-a"))).toBe(true);
    expect(loadHelperHistory(storage, "user-a")).toEqual([me(1), done(2)]);
    // 다른 계정에는 보이지 않는다
    expect(loadHelperHistory(storage, "user-b")).toEqual([]);
  });

  it("답을 기다리던 말풍선은 실패로 저장해 다시 시도할 수 있게 한다", () => {
    const rows = forStorage([me(1), { id: 2, from: "bot", state: "loading", question: "질문 1" }]);
    expect(rows[1]).toEqual({ id: 2, from: "bot", state: "error", question: "질문 1" });
  });

  it("최근 50개만 남기고, 잘린 자리가 답이면 질문과 짝을 맞춘다", () => {
    const many: StoredMessage[] = [];
    for (let i = 1; i <= 61; i += 2) many.push(me(i), done(i + 1));
    expect(many).toHaveLength(62);
    const kept = trimHistory(many);
    expect(kept.length).toBeLessThanOrEqual(HELPER_HISTORY_LIMIT);
    expect(kept[0].from).toBe("me");
    expect(kept[kept.length - 1]).toEqual(done(62));
    // 홀수로 잘리면 첫 답 하나를 더 뺀다
    const odd = trimHistory([done(0), me(1), done(2)], 3);
    expect(odd).toEqual([me(1), done(2)]);
  });

  it("빈 대화는 키를 지우고, 깨진 값·모르는 모양은 빈 목록으로 읽는다", () => {
    const storage = fakeStorage();
    saveHelperHistory(storage, "u", [me(1)]);
    saveHelperHistory(storage, "u", []);
    expect(storage.data.has(helperHistoryKey("u"))).toBe(false);
    storage.setItem(helperHistoryKey("u"), "{not json");
    expect(loadHelperHistory(storage, "u")).toEqual([]);
    storage.setItem(helperHistoryKey("u"), JSON.stringify([{ id: "x" }, me(3), { from: "bot" }]));
    expect(loadHelperHistory(storage, "u")).toEqual([me(3)]);
  });

  it("[대화 지우기]는 내 계정만, 로그아웃은 모든 계정의 대화를 지우고 다른 키는 둔다", () => {
    const storage = fakeStorage();
    saveHelperHistory(storage, "a", [me(1)]);
    saveHelperHistory(storage, "b", [me(1)]);
    storage.setItem("carebridge-demo-session", "x");
    clearHelperHistory(storage, "a");
    expect(loadHelperHistory(storage, "a")).toEqual([]);
    expect(loadHelperHistory(storage, "b")).toHaveLength(1);
    clearAllHelperHistory(storage);
    expect(loadHelperHistory(storage, "b")).toEqual([]);
    expect(storage.getItem("carebridge-demo-session")).toBe("x");
  });

  it("저장소가 없거나 막혀도 예외를 내지 않는다", () => {
    const blocked: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveHelperHistory(blocked, "u", [me(1)])).not.toThrow();
    expect(loadHelperHistory(blocked, "u")).toEqual([]);
    expect(() => clearAllHelperHistory(blocked)).not.toThrow();
    expect(loadHelperHistory(undefined, "u")).toEqual([]);
    expect(() => saveHelperHistory(undefined, "u", [me(1)])).not.toThrow();
  });
});
