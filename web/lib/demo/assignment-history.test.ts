import { describe, expect, it } from "vitest";

import { historyDays, historyOf, historyPeriod } from "./assignment-history";
import type { AssignmentHistoryEntry } from "./store";

const entry = (over: Partial<AssignmentHistoryEntry>): AssignmentHistoryEntry => ({
  residentId: "r1",
  workerId: "w1",
  startDate: "2026-10-01",
  endDate: null,
  visitDays: null,
  ...over,
});

describe("M4 담당 이력 (#381)", () => {
  it("그 어르신 것만, 지금 담당을 먼저, 그다음 시작일이 늦은 순", () => {
    const rows = [
      entry({ workerId: "a", startDate: "2026-09-01", endDate: "2026-09-30" }),
      entry({ residentId: "r2", workerId: "x" }),
      entry({ workerId: "b", startDate: "2026-10-25" }),
      entry({ workerId: "c", startDate: "2026-10-01", endDate: "2026-10-24" }),
    ];
    expect(historyOf(rows, "r1").map((row) => row.workerId)).toEqual(["b", "c", "a"]);
  });

  it("기간과 방문 요일을 읽기 쉽게 쓴다", () => {
    expect(historyPeriod(entry({ startDate: "2026-10-25" }))).toBe("2026-10-25 ~ 지금");
    expect(historyPeriod(entry({ endDate: "2026-10-24" }))).toBe("2026-10-01 ~ 2026-10-24");
    expect(historyDays(entry({ visitDays: [5, 1, 3] }))).toBe("월·수·금");
    expect(historyDays(entry({ visitDays: null }))).toBe("");
  });
});
