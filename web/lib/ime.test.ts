import { describe, expect, it } from "vitest";

import {
  COMPOSE_IDLE,
  type ComposeEvent,
  type ComposeState,
  composeOutside,
  composeStep,
} from "./ime";

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
  it("조합 중에도 입력마다 바깥에 알리고, 칸은 조합 중인 값을 들고 있다 (#184)", () => {
    const { state, commits, drafts } = run([
      ["start", ""],
      ["input", "ㅎ"],
      ["input", "하"],
      ["input", "한"],
      ["end", "한"],
    ]);
    expect(commits).toEqual([null, "ㅎ", "하", "한", "한"]);
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
    expect(commits).toEqual([null, "한", "한", "한a"]);
  });

  it("조합 중 바깥 값이 달라도(대문자 변환 등) 칸에는 조합 중인 값이 남는다", () => {
    const { state } = run([
      ["start", "ab"],
      ["input", "abㅎ"],
    ]);
    // 칸은 draft를 보이므로 바깥이 "AB"로 바꿔도 조합 중에는 덮어쓰지 않는다
    expect(state.draft ?? "AB").toBe("abㅎ");
  });

  it("조합이 끝나기 전에 버튼을 눌러도 바깥 값에 마지막 글자가 있다 (#184 W2·W3)", () => {
    const { commits, state } = run([
      ["start", "오늘 잘 드셨어"],
      ["input", "오늘 잘 드셨어ㅇ"],
      ["input", "오늘 잘 드셨어요"],
    ]);
    // 여기서 버튼이 눌리면 바깥은 마지막으로 알린 값을 저장한다
    expect(commits.at(-1)).toBe("오늘 잘 드셨어요");
    expect(state.composing).toBe(true);
  });
});

describe("composeOutside", () => {
  it("조합 중 바깥이 칸을 비우면 조합 중인 글을 버리고, 늦게 오는 조합 끝은 알리지 않는다 (#184 W6)", () => {
    const typed = run([
      ["start", ""],
      ["input", "물 얼마나 드려요"],
    ]);
    const cleared = composeOutside(typed.state, "");
    expect(cleared.draft).toBeNull();
    const end = composeStep(cleared, "end", "물 얼마나 드려요");
    expect(end.commit).toBeNull();
    expect(end.state).toEqual(COMPOSE_IDLE);
  });

  it("칸을 비운 뒤 조합이 이어지면 새 입력은 다시 알린다", () => {
    const cleared = composeOutside(
      run([
        ["start", ""],
        ["input", "가"],
      ]).state,
      "",
    );
    const { state, commits } = run(
      [
        ["input", "ㄴ"],
        ["end", "ㄴ"],
      ],
      cleared,
    );
    expect(commits).toEqual(["ㄴ", "ㄴ"]);
    expect(state).toEqual(COMPOSE_IDLE);
  });

  it("바깥 값이 빈 값이 아니면(대문자 바꾸기 등) 조합 중인 값을 그대로 보인다 (#107)", () => {
    const typing = run([
      ["start", "ab"],
      ["input", "abㅎ"],
    ]).state;
    expect(composeOutside(typing, "ABㅎ")).toBe(typing);
  });

  it("조합 중이 아니거나 칸이 비어 있으면 바꾸지 않는다", () => {
    expect(composeOutside(COMPOSE_IDLE, "")).toBe(COMPOSE_IDLE);
    const empty = run([["start", ""]]).state;
    expect(composeOutside(empty, "")).toBe(empty);
  });
});
