// 한글처럼 글자를 조합해 넣는 입력(IME) 중에 제어 입력칸(value를 React 상태로 두는 칸)의 값을 밖에서 덮어쓰면,
// Chromium이 조합 중이던 글자를 다시 넣어 글자가 두 번 들어간다(이슈 #107. 한/영 변환키로 조합을 끝낼 때 자주 보임).
// 그래서 조합 중에는 칸이 가진 값(draft)을 그대로 보이고 바깥 값으로 덮어쓰지 않는다.
// 다만 바깥(React 상태)에는 조합 중 입력도 바로 알린다. 조합이 끝나기 전에 버튼이 눌려도
// 칸에 보이는 마지막 글자까지 저장·전송되게 하기 위해서다(이슈 #184).
export type ComposeState = {
  composing: boolean;
  /** 조합 중 칸이 가진 값. 조합이 아니면 null(바깥 값을 그대로 보임) */
  draft: string | null;
  /** 조합 중 바깥이 칸을 비워 조합 중이던 글을 버렸음. 이어 오는 조합 끝은 바깥에 알리지 않는다 */
  discarded: boolean;
};
export type ComposeEvent = "start" | "input" | "end";

export const COMPOSE_IDLE: ComposeState = { composing: false, draft: null, discarded: false };

/** 입력 사건 하나를 반영한다. commit이 있으면 그 값을 바깥에 알린다 */
export function composeStep(
  state: ComposeState,
  event: ComposeEvent,
  value: string,
): { state: ComposeState; commit: string | null } {
  if (event === "start") {
    return { state: { composing: true, draft: value, discarded: false }, commit: null };
  }
  if (event === "end") return { state: COMPOSE_IDLE, commit: state.discarded ? null : value };
  if (state.composing) {
    return { state: { composing: true, draft: value, discarded: false }, commit: value };
  }
  return { state: COMPOSE_IDLE, commit: value };
}

/**
 * 조합 중 바깥 값이 빈 값으로 바뀌면(보낸 뒤 칸 비우기, 새 대화) 조합 중이던 글을 버리고 바깥 값을 보인다.
 * 늦게 오는 조합 끝이 보낸 글을 칸에 되살리지 않게 한다(이슈 #184 W6).
 * 빈 값일 때만 처리해서 대문자 바꾸기 같은 바깥 변환은 그대로 조합 중인 값을 보인다(#107).
 */
export function composeOutside(state: ComposeState, outside: string): ComposeState {
  if (!state.composing || !state.draft || outside !== "") return state;
  return { composing: true, draft: null, discarded: true };
}
