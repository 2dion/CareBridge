// 한글처럼 글자를 조합해 넣는 입력(IME) 중에 제어 입력칸(value를 React 상태로 두는 칸)의 값을 밖에서 덮어쓰면,
// Chromium이 조합 중이던 글자를 다시 넣어 글자가 두 번 들어간다(이슈 #107. 한/영 변환키로 조합을 끝낼 때 자주 보임).
// 조합 중에는 칸이 가진 값을 그대로 보이고, 조합이 끝났을 때 한 번만 바깥(React 상태)에 알린다.
export type ComposeState = {
  composing: boolean;
  /** 조합 중 칸이 가진 값. 조합이 아니면 null(바깥 값을 그대로 보임) */
  draft: string | null;
};
export type ComposeEvent = "start" | "input" | "end";

export const COMPOSE_IDLE: ComposeState = { composing: false, draft: null };

/** 입력 사건 하나를 반영한다. commit이 있으면 그 값을 바깥에 알린다 */
export function composeStep(
  state: ComposeState,
  event: ComposeEvent,
  value: string,
): { state: ComposeState; commit: string | null } {
  if (event === "start") return { state: { composing: true, draft: value }, commit: null };
  if (event === "end") return { state: COMPOSE_IDLE, commit: value };
  if (state.composing) return { state: { composing: true, draft: value }, commit: null };
  return { state: COMPOSE_IDLE, commit: value };
}
