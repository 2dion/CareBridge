import { describe, expect, it } from "vitest";

import { capitalizeVi } from "@/lib/records/item-badge";

import { ROLE_NAMES_BOTH, roleNames } from "./roles";

// 이슈 #125·#146: 교육용 기관 화면은 교육생·강사, 일반 기관은 작성자·관리자(용어집 v1.0)
describe("roleNames", () => {
  it("일반 기관은 작성자·관리자", () => {
    expect(roleNames(false)).toMatchObject({
      worker: "작성자",
      workerVi: "người ghi chép",
      reviewer: "관리자",
      reviewerVi: "người quản lý",
      training: false,
    });
  });

  it("교육용 기관은 교육생(học viên)·강사(giảng viên)", () => {
    expect(roleNames(true)).toMatchObject({
      worker: "교육생",
      workerVi: "học viên",
      reviewer: "강사",
      reviewerVi: "giảng viên",
      training: true,
    });
  });

  it("기관을 모를 때(로그인 전)는 둘을 함께 쓴다", () => {
    expect(ROLE_NAMES_BOTH).toEqual({
      worker: "작성자(교육생)",
      workerVi: "người ghi chép (học viên)",
      reviewer: "관리자(강사)",
      reviewerVi: "người quản lý (giảng viên)",
    });
  });
});

describe("베트남어 역할 이름을 문장 처음에 쓸 때(이슈 #179)", () => {
  it("두 기관 모두 첫 글자를 대문자로", () => {
    expect(capitalizeVi(roleNames(false).reviewerVi)).toBe("Người quản lý");
    expect(capitalizeVi(roleNames(true).reviewerVi)).toBe("Giảng viên");
  });
});
