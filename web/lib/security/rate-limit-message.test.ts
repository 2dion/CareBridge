import { describe, expect, it } from "vitest";

import { actionError } from "@/lib/real/actions";

// 이슈 #256: 429 rate_limited는 기본 문구가 아니라 '잠시 뒤 다시' 안내를 보인다
describe("rate_limited 안내", () => {
  it("한국어·베트남어 안내 문구가 있다", () => {
    const error = actionError("rate_limited");
    expect(error.ko).toContain("요청이 너무 많아요");
    expect(error.native).toContain("quá nhiều yêu cầu");
  });
});
