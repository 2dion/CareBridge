import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

// 이슈 #256: 기본 보안 헤더. PDF iframe(같은 사이트)과 녹음 마이크는 막지 않는다
describe("next.config headers()", () => {
  it("모든 경로에 화면 끼워 넣기 제한·nosniff·마이크 허용 헤더를 준다", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    const headers = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Permissions-Policy"]).toContain("microphone=(self)");
  });
});
