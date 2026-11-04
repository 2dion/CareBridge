// A0(스플래시) 시간(화면 v2.2.1 '계정 화면' A0, 이슈 #111·#104). 실제 모드의 첫 화면(/)은 로고와 한 줄 소개를 보인 뒤
// A1(로그인)이나 로그인한 사람의 첫 화면으로 자동으로 넘어간다. 페이지와 데이터 공급자가 같은 기준을 쓰도록 한곳에 둔다.

/** 스플래시가 보이는 최소 시간(ms). 한 줄 소개는 A1(로그인)에 없고 여기서만 보이므로 읽을 시간을 준다(이슈 #104). 누르면 바로 넘어간다 */
export const SPLASH_MS = 2500;

// 스플래시가 처음 그려진 때(performance.now() 기준). 페이지를 여는 데 걸린 시간을 빼고 세기 위해 둔다
let shownAt: number | null = null;

/** 스플래시가 그려졌을 때 부른다. 한 번 연 페이지에서는 처음 그려진 때만 남긴다 */
export function markSplashShown(now = performance.now()): void {
  if (shownAt === null) shownAt = now;
}

/** 시험용: 남긴 시각을 지운다 */
export function resetSplashForTest(): void {
  shownAt = null;
}

/** 스플래시 시간이 끝나기까지 남은 ms. 이미 지났으면 0.
 *  그려진 때부터 센다(아직 안 그려졌으면 페이지가 열린 때부터). 앱 안에서 다시 /로 오면 이미 지나 있어 바로 넘어간다 */
export function splashRemaining(now = performance.now()): number {
  return Math.max(0, SPLASH_MS - (now - (shownAt ?? 0)));
}
