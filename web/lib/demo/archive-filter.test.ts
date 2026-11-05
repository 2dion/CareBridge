import { describe, expect, it } from "vitest";

import { archiveHref, forResident, pickedResident } from "./archive-filter";

const residents = [{ id: "r1" }, { id: "r2" }];
const rows = [
  { residentId: "r1", careDate: "2026-11-01" },
  { residentId: "r2", careDate: "2026-11-02" },
  { residentId: "r1", careDate: "2026-11-03" },
];

describe("W4 어르신 고르기 (#326)", () => {
  it("읽을 수 있는 어르신만 고른다. 없거나 모르는 id면 전체", () => {
    expect(pickedResident(residents, "r2")).toBe("r2");
    expect(pickedResident(residents, null)).toBeNull();
    expect(pickedResident(residents, "")).toBeNull();
    // 다른 작성자 담당 등 목록에 없는 어르신 id를 주소에 넣어도 거르지 않는다
    expect(pickedResident(residents, "someone-else")).toBeNull();
  });

  it("전체면 그대로, 고르면 그 어르신 줄만", () => {
    expect(forResident(rows, null)).toEqual(rows);
    expect(forResident(rows, "r1").map((row) => row.careDate)).toEqual([
      "2026-11-01",
      "2026-11-03",
    ]);
    expect(forResident(rows, "r3")).toEqual([]);
  });

  it("주소에 상태 탭과 고른 어르신을 함께 남긴다", () => {
    expect(archiveHref("draft", null)).toBe("/archive?tab=draft");
    expect(archiveHref("approved", "r1")).toBe("/archive?tab=approved&resident=r1");
  });
});
