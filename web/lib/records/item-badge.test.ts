import { describe, expect, it } from "vitest";

import { roleNames } from "@/lib/demo/roles";

import { itemBadge, withNote } from "./item-badge";

describe("W4 상세 항목 배지 (이슈 #98)", () => {
  const org = roleNames(false);
  const training = roleNames(true);

  it("[확인함]으로 승인한 항목은 '관리자 확인함', 교육용 기관은 '강사 확인함'", () => {
    const item = { status: "needs_check", resolution: "confirmed_by_reviewer" } as const;
    expect(itemBadge(item, org)).toEqual({
      kind: "confirmed",
      ko: "관리자 확인함",
      vi: "Người quản lý đã xác nhận",
      tone: "green",
    });
    expect(itemBadge(item, training)?.ko).toBe("강사 확인함");
    expect(itemBadge(item, training)?.vi).toBe("Giảng viên đã xác nhận");
  });

  it("[기록 안 함]으로 승인한 항목은 '관리자 기록 안 함'", () => {
    const item = { status: "needs_check", resolution: "omitted" } as const;
    expect(itemBadge(item, org)).toMatchObject({
      kind: "omitted",
      ko: "관리자 기록 안 함",
      vi: "Người quản lý không ghi",
    });
  });

  it("아직 고르지 않은 항목만 '확인 필요', 나머지 상태는 배지 없음", () => {
    expect(itemBadge({ status: "needs_check", resolution: null }, org)).toMatchObject({
      kind: "needs_check",
      ko: "확인 필요",
      vi: null,
    });
    expect(itemBadge({ status: "observed", resolution: null }, org)).toBeNull();
    expect(itemBadge({ status: "not_mentioned", resolution: null }, org)).toBeNull();
  });

  it("메모가 비면 끝에 점(·)을 남기지 않는다", () => {
    expect(withNote("관리자 기록 안 함", "")).toBe("관리자 기록 안 함");
    expect(withNote("관리자 기록 안 함", "   ")).toBe("관리자 기록 안 함");
    expect(withNote("관리자 기록 안 함", undefined)).toBe("관리자 기록 안 함");
    expect(withNote("관리자 기록 안 함", "병원 진료로 외출")).toBe(
      "관리자 기록 안 함 · 병원 진료로 외출",
    );
  });
});
