import { describe, expect, it } from "vitest";

import { redirectFor, roleHome } from "./role-gate";

describe("역할별 화면 막기 (이슈 #114)", () => {
  it("역할의 첫 화면", () => {
    expect(roleHome("worker")).toBe("/today");
    expect(roleHome("reviewer")).toBe("/overview");
  });

  it("작성자·교육생이 M 화면을 열면 /today로", () => {
    expect(redirectFor("reviewer", "worker")).toBe("/today");
  });

  it("관리자·강사가 W 화면을 열면 /review로", () => {
    expect(redirectFor("worker", "reviewer")).toBe("/overview");
  });

  it("맞는 역할이면 그대로", () => {
    expect(redirectFor("worker", "worker")).toBeNull();
    expect(redirectFor("reviewer", "reviewer")).toBeNull();
  });

  it("Mock 모드·읽는 중(역할 없음)이면 막지 않음", () => {
    expect(redirectFor("reviewer", null)).toBeNull();
    expect(redirectFor("worker", undefined)).toBeNull();
  });
});
