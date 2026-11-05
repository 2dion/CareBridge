import { beforeEach, describe, expect, it } from "vitest";

import { markSplashShown, resetSplashForTest, SPLASH_MS, splashRemaining } from "./splash";

// 이슈 #111·#104: A0(스플래시)는 그려진 때부터 SPLASH_MS 동안 보인 뒤 자동으로 넘어가고, 이미 시간이 지났으면 바로 넘어간다
describe("splashRemaining", () => {
  beforeEach(() => resetSplashForTest());

  it("페이지가 막 열렸으면 스플래시 시간 전부가 남는다", () => {
    expect(splashRemaining(0)).toBe(SPLASH_MS);
  });

  it("조금 지났으면 남은 만큼만 기다린다", () => {
    expect(splashRemaining(SPLASH_MS - 400)).toBe(400);
  });

  it("이미 시간이 지났으면 0이라 바로 넘어간다", () => {
    expect(splashRemaining(SPLASH_MS)).toBe(0);
    expect(splashRemaining(SPLASH_MS * 10)).toBe(0);
  });

  it("페이지를 여는 데 오래 걸려도 그려진 때부터 스플래시 시간 전부를 센다", () => {
    markSplashShown(3000);
    expect(splashRemaining(3000)).toBe(SPLASH_MS);
    expect(splashRemaining(3000 + SPLASH_MS - 500)).toBe(500);
  });

  it("다시 그려져도 처음 그려진 때를 기준으로 한다", () => {
    markSplashShown(1000);
    markSplashShown(9000);
    expect(splashRemaining(9000)).toBe(0);
  });
});
