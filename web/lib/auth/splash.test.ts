import { describe, expect, it } from "vitest";

import { SPLASH_MS, splashRemaining } from "./splash";

// 이슈 #111: A0(스플래시)는 짧게 보인 뒤 자동으로 넘어가고, 이미 시간이 지났으면 바로 넘어간다
describe("splashRemaining", () => {
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
});
