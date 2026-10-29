import { describe, expect, it } from "vitest";

import { COMPOSE_IDLE, type ComposeEvent, type ComposeState, composeStep } from "./ime";

// 이슈 #107: 한글 조합 중 제어 입력칸을 덮어쓰면 글자가 두 번 들어간다
function run(events: [ComposeEvent, string][], start: ComposeState = COMPOSE_IDLE) {
  const commits: (string | null)[] = [];
  const drafts: (string | null)[] = [];
  let state = start;
  for (const [event, value] of events) {
    const next = composeStep(state, event, value);
    state = next.state;
    commits.push(next.commit);
    drafts.push(state.draft);
  }
  return { state, commits, drafts };
}

describe("composeStep", () => {
  it("조합 중에는 바깥에 알리지 않고 칸 값을 들고 있다가, 조합이 끝날 때 한 번 알린다", () => {
    const { state, commits, drafts } = run([
      ["start", ""],
      ["input", "ㅎ"],
      ["input", "하"],
      ["input", "한"],
      ["end", "한"],
    ]);
    expect(commits).toEqual([null, null, null, null, "한"]);
    expect(drafts).toEqual(["", "ㅎ", "하", "한", null]);
    expect(state).toEqual(COMPOSE_IDLE);
  });

  it("조합이 아닌 입력(영문·숫자·지우기)은 바로 알린다", () => {
    const { commits, drafts } = run([
      ["input", "a"],
      ["input", "ab"],
      ["input", "a"],
    ]);
    expect(commits).toEqual(["a", "ab", "a"]);
    expect(drafts).toEqual([null, null, null]);
  });

  it("한/영 변환키로 조합이 끝난 뒤 이어 치는 영문은 조합이 아니라 바로 알린다", () => {
    const { commits } = run([
      ["start", ""],
      ["input", "한"],
      ["end", "한"],
      ["input", "한a"],
    ]);
    expect(commits).toEqual([null, null, "한", "한a"]);
  });

  it("조합 중 바깥 값이 달라도(대문자 변환 등) 칸에는 조합 중인 값이 남는다", () => {
    const { state } = run([
      ["start", "ab"],
      ["input", "abㅎ"],
    ]);
    // 칸은 draft를 보이므로 바깥이 "AB"로 바꿔도 조합 중에는 덮어쓰지 않는다
    expect(state.draft ?? "AB").toBe("abㅎ");
  });
});
