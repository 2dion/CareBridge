import { describe, expect, it } from "vitest";

import { createDemoDb, type DemoRecord, visitMinutes } from "../demo/store";
import { minutesBetween, resolveVisitMinutes } from "./validate-draft";

// 이슈 #238: 자정을 넘는 방문
describe("minutesBetween", () => {
  it("보통 방문은 분 차이", () => {
    expect(minutesBetween("14:00", "17:00")).toBe(180);
    expect(minutesBetween("14:00:00", "17:30:00")).toBe(210);
  });

  it("자정을 넘으면 음수가 아니라 null(방문 시간 모름)", () => {
    expect(minutesBetween("23:00", "01:00")).toBeNull();
    expect(minutesBetween("23:00:00", "01:00:00")).toBeNull();
  });

  it("검사 5 입력도 음수가 되지 않는다", () => {
    const known = minutesBetween("23:00:00", "01:00:00");
    expect(resolveVisitMinutes(known, {}, { start: "23:00", end: "01:00" })).toBeNull();
    expect(resolveVisitMinutes(known, { total_minutes: 120 })).toBe(120);
  });
});

describe("store.visitMinutes", () => {
  it("자정을 넘는 입력은 음수가 아니라 null", () => {
    const db = createDemoDb("2026-10-31");
    const record = Object.values(db.records)[0] as DemoRecord;
    const at = (start: string, end: string): DemoRecord => ({
      ...record,
      items: record.items.map((item) =>
        item.item_key === "visit_time" ? { ...item, detail: { start, end } } : item,
      ),
    });
    expect(visitMinutes(at("23:00", "01:00"))).toBeNull();
    expect(visitMinutes(at("14:00", "17:00"))).toBe(180);
  });
});
