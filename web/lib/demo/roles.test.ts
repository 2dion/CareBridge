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

describe("조사를 붙인 작성자 이름(이슈 #178)", () => {
  it("일반 기관: 작성자가·를·는·로", () => {
    const names = roleNames(false);
    expect([names.workerSubject, names.workerObject, names.workerTopic, names.workerAs]).toEqual([
      "작성자가",
      "작성자를",
      "작성자는",
      "작성자로",
    ]);
  });
  it("교육용 기관: 받침이 있어 교육생이·을·은·으로", () => {
    const names = roleNames(true);
    expect([names.workerSubject, names.workerObject, names.workerTopic, names.workerAs]).toEqual([
      "교육생이",
      "교육생을",
      "교육생은",
      "교육생으로",
    ]);
  });
  it("조사 붙은 이름은 앞 이름으로 시작한다", () => {
    for (const training of [false, true]) {
      const names = roleNames(training);
      for (const value of [
        names.workerSubject,
        names.workerObject,
        names.workerTopic,
        names.workerAs,
      ]) {
        expect(value.startsWith(names.worker)).toBe(true);
      }
    }
  });
});

// '{names.worker}가'처럼 받침에 따라 바뀌는 조사를 이름 뒤에 바로 붙이면 '교육생가'가 된다(이슈 #178).
describe("화면 코드에 역할 이름 + 조사를 바로 붙이지 않는다", () => {
  it("app·components에 names.worker 뒤 가·를·는·로·이·을·은이 없다", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const found: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of readdirSync(dir, { recursive: true }) as string[]) {
        if (!/\.tsx?$/.test(file) || /\.test\./.test(file)) continue;
        const text = readFileSync(join(dir, file), "utf8");
        for (const match of text.matchAll(/names\.worker\}(가|를|는|로|이|을|은)/g)) {
          found.push(`${dir}/${file}: ${match[0]}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
