import { describe, expect, it } from "vitest";

import { elapsedReturnDays, overviewCounts } from "./overview";
import { reviewQueue } from "./review";
import { createDemoDb, returnedRecords } from "./store";

const TODAY = "2026-10-30";
const NOW = Date.parse("2026-10-30T12:00:00+09:00");

describe("M0 기록 현황 (#148)", () => {
  it("검토 대기·재전송·지연전송·확인 필요 0은 전송한 기록만 센다", () => {
    const db = createDemoDb(TODAY);
    const source = reviewQueue(db)[0];
    const one = {
      ...source,
      id: "one",
      firstSubmittedAt: "2026-10-30T10:00:00+09:00",
      careDate: TODAY,
      events: [],
    };
    const two = {
      ...source,
      id: "two",
      firstSubmittedAt: "2026-10-30T11:00:00+09:00",
      careDate: "2026-10-29",
      items: source.items.map((item) => ({ ...item, status: "observed" as const })),
      events: [{ type: "returned" as const, actor: "관리자", at: "2026-10-30T10:30:00+09:00" }],
    };
    const returned = {
      ...one,
      id: "returned",
      status: "returned" as const,
      returnedAt: "2026-10-28T12:00:00+09:00",
    };
    db.records = { one, two, returned };
    const counts = overviewCounts(db, TODAY, NOW);
    expect(counts.waiting).toBe(2);
    expect(counts.resent).toBe(1);
    expect(counts.late).toBe(1);
    expect(counts.noUnresolved).toBe(1);
    expect(counts.returned).toBe(1);
    expect(counts.returnedOver48h).toBe(0);
    expect(overviewCounts(db, TODAY, NOW + 1).returnedOver48h).toBe(1);
  });

  it("수정 요청 경과일은 잘못된 시각이나 미래 시각에 음수가 되지 않는다", () => {
    expect(elapsedReturnDays("2026-10-28T12:00:00+09:00", NOW)).toBe(2);
    expect(elapsedReturnDays("2026-10-31T12:00:00+09:00", NOW)).toBe(0);
    expect(elapsedReturnDays("invalid", NOW)).toBe(0);
  });

  it("검토 대기는 확인 필요 수보다 받은 시각을 우선하고 입력 자료를 바꾸지 않는다", () => {
    const db = createDemoDb(TODAY);
    const source = reviewQueue(db)[0];
    db.records = {
      later: { ...source, id: "later", submittedAt: "2026-10-30T11:00:00Z" },
      earlier: {
        ...source,
        id: "earlier",
        submittedAt: "2026-10-30T09:00:00Z",
        items: source.items.map((item) => ({ ...item, status: "observed" })),
      },
      unknown: { ...source, id: "unknown", submittedAt: null },
    };
    const before = structuredClone(db);
    expect(reviewQueue(db).map((record) => record.id)).toEqual(["earlier", "later", "unknown"]);
    expect(db).toEqual(before);
  });

  it("수정 필요 기록을 다시 전송하면 수정 요청 중 수에서 빠진다", () => {
    const db = createDemoDb(TODAY);
    const record = returnedRecords(db)[0];
    const before = overviewCounts(db, TODAY, NOW);
    db.records[record.id] = {
      ...record,
      status: "submitted",
      submittedAt: new Date(NOW).toISOString(),
    };
    const after = overviewCounts(db, TODAY, NOW);
    expect(after.returned).toBe(before.returned - 1);
    expect(after.waiting).toBe(before.waiting + 1);
  });
});
