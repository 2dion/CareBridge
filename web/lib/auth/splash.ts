// A0(스플래시) 시간(화면 v1.3 '계정 화면' A0, 이슈 #111). 실제 모드의 첫 화면(/)은 로고를 짧게 보인 뒤
// A1(로그인)이나 로그인한 사람의 첫 화면으로 자동으로 넘어간다. 페이지와 데이터 공급자가 같은 기준을 쓰도록 한곳에 둔다.

/** 스플래시가 보이는 최소 시간(ms). 짧아서 기다리는 느낌이 없고, 누르면 바로 넘어간다 */
export const SPLASH_MS = 1500;

/** 페이지가 열린 뒤 스플래시 시간이 끝나기까지 남은 ms. 이미 지났으면 0.
 *  performance.now()는 페이지가 열린 때부터 센 시간이라, 앱 안에서 다시 /로 오면 거의 0이 되어 바로 넘어간다 */
export function splashRemaining(now = performance.now()): number {
  return Math.max(0, SPLASH_MS - now);
}
