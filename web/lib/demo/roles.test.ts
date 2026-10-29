import { describe, expect, it } from "vitest";

import { roleNames } from "./roles";

// 이슈 #125: 교육용 기관 화면은 교육생·강사, 일반 기관은 작성자·관리자(용어집 v1.0)
describe("roleNames", () => {
  it("일반 기관은 작성자·관리자", () => {
    expect(roleNames(false)).toMatchObject({
      worker: "작성자",
      reviewer: "관리자",
      reviewerVi: "người quản lý",
      training: false,
    });
  });

  it("교육용 기관은 교육생·강사(giảng viên)", () => {
    expect(roleNames(true)).toMatchObject({
      worker: "교육생",
      reviewer: "강사",
      reviewerVi: "giảng viên",
      training: true,
    });
  });
});
