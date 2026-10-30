import { describe, expect, it } from "vitest";

import { createDemoDb, displayOrder } from "@/lib/demo/store";
import { recordViewItems } from "./view-order";

describe("W4 승인 기록 읽기 순서 (#101)", () => {
  it("다음 확인사항·미처리 확인 필요를 먼저 보이고 빈 항목만 따로 모은다", () => {
    const db = createDemoDb("2026-10-30");
    const source = Object.values(db.records).find((record) => record.items.length === 9)!;
    const items = source.items.map((item) => ({
      ...item,
      status: "observed" as const,
      resolution: null,
      value_ko: "내용",
    }));
    const meal = items.find((item) => item.item_key === "meal")!;
    const sleep = items.find((item) => item.item_key === "sleep")!;
    const mixed = items.map((item) =>
      item === meal
        ? { ...item, status: "needs_check" as const }
        : item === sleep
          ? { ...item, status: "not_mentioned" as const, value_ko: "" }
          : item,
    );
    const before = structuredClone(mixed);
    const sections = recordViewItems(mixed, true);
    expect(sections.visible.slice(0, 2).map((item) => item.item_key)).toEqual([
      "next_check",
      "meal",
    ]);
    expect(sections.missing.map((item) => item.item_key)).toEqual(["sleep"]);
    expect(sections.visible.length + sections.missing.length).toBe(9);
    expect(mixed).toEqual(before);
    expect(recordViewItems(mixed, false).visible.map((item) => item.item_key)).toEqual(
      displayOrder,
    );
    expect(recordViewItems(mixed, false).missing).toEqual([]);
  });
});
