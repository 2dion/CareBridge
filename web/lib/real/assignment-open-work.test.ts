import { describe, expect, it } from "vitest";

import { openWorkError } from "./actions";

// M4 담당 끊기: DB가 남은 기록·빈 날로 거절하면 건수를 알린다(이슈 #379)
describe("openWorkError", () => {
  it("남은 기록과 빈 날 건수를 함께 알린다", () => {
    const error = openWorkError('{"open_records":2,"empty_days":3}');
    expect(error.error).toBe("assignment_open_work");
    expect(error.ko).toBe(
      "끝나지 않은 기록 2건, 빈 날 3일이 남아 담당을 끊을 수 없어요. 승인하거나 기록 없음으로 정리한 뒤 다시 해 주세요.",
    );
  });

  it("하나만 남으면 그것만 알린다", () => {
    expect(openWorkError('{"open_records":0,"empty_days":1}').ko).toMatch(/^빈 날 1일이 남아/);
    expect(openWorkError('{"open_records":1,"empty_days":0}').ko).toMatch(
      /^끝나지 않은 기록 1건이 남아/,
    );
  });

  it("건수를 읽지 못해도 안내한다", () => {
    expect(openWorkError(undefined).ko).toMatch(/^끝나지 않은 기록이나 빈 날이 남아/);
    expect(openWorkError("not json").ko).toMatch(/^끝나지 않은 기록이나 빈 날이 남아/);
  });
});
