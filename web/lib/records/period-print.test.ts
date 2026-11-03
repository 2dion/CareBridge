// 기간 인쇄 API(GET /api/residents/:id/print, 이슈 #261). 공통 계약의 출력 모양과 오류 키를 검사한다.
import { describe, expect, it, vi } from "vitest";

import {
  addDays,
  DAYS_PER_SHEET,
  isValidDate,
  type PeriodPrintDeps,
  type PeriodRecordRow,
  type PeriodResident,
  printPeriod,
} from "./period-print";
import type { PrintItem } from "./print";

const TODAY = "2026-11-03";

const home: PeriodResident = {
  id: "res-1",
  name: "가상 어르신",
  care_type: "home",
  is_training: false,
};
const facility: PeriodResident = { ...home, id: "res-2", care_type: "facility" };

function row(patch: Partial<PeriodRecordRow> & { care_date: string }): PeriodRecordRow {
  return {
    id: `rec-${patch.care_date}`,
    status: "approved",
    form_type: "12",
    form_fields: { total_minutes: 180 },
    visit_start: "14:00:00",
    visit_end: "17:00:00",
    worker_id: "worker-1",
    ...patch,
  };
}

const item = (record_id: string): PrintItem & { record_id: string } => ({
  record_id,
  item_key: "meal",
  value_ko: "점심 절반 드심",
  status: "observed",
  detail: {},
  resolution: null,
});

function fakeDeps(
  resident: PeriodResident | null,
  records: PeriodRecordRow[],
  overrides: Partial<PeriodPrintDeps> = {},
): PeriodPrintDeps {
  return {
    currentUser: vi.fn(async () => ({ id: "reviewer-1", role: "reviewer" as const })),
    findResident: vi.fn(async () => resident),
    listRecords: vi.fn(async () => records),
    listItems: vi.fn(async (ids: string[]) => ids.map(item)),
    listNoCareDays: vi.fn(async () => []),
    workerNames: vi.fn(async () => ({ "worker-1": "가상 작성자" })),
    today: () => TODAY,
    ...overrides,
  };
}

describe("날짜 도우미", () => {
  it("실제 있는 날짜만 받고 n일을 더한다", () => {
    expect(isValidDate("2026-11-03")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-1-3")).toBe(false);
    expect(addDays("2026-10-30", 6)).toBe("2026-11-05");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("printPeriod", () => {
  it("재가(제12호)는 7칸: 승인한 날은 기록(인쇄 1건과 같은 모양 + 작성자 이름), 나머지는 뺀 이유", async () => {
    const deps = fakeDeps(home, [
      row({ care_date: "2026-10-27" }),
      row({ care_date: "2026-10-28", status: "submitted" }),
      row({ care_date: "2026-10-30", form_type: "16" }),
      row({ care_date: "2026-11-01" }),
    ]);
    vi.mocked(deps.listNoCareDays).mockResolvedValue(["2026-10-29"]);
    const r = await printPeriod("res-1", "2026-10-27", deps);
    expect(r.status).toBe(200);
    const body = r.body as {
      resident: unknown;
      form_type: string;
      from: string;
      to: string;
      verified: string;
      is_training: boolean;
      days: { care_date: string; record: Record<string, unknown> | null; skipped: string }[];
    };
    expect(body.resident).toEqual({ id: "res-1", name: "가상 어르신" });
    expect(body.form_type).toBe("12");
    expect(body.from).toBe("2026-10-27");
    expect(body.to).toBe("2026-11-02");
    expect(body.verified).toBe("verified");
    expect(body.is_training).toBe(false);
    expect(body.days).toHaveLength(DAYS_PER_SHEET["12"]);
    expect(body.days.map((day) => [day.care_date, day.skipped])).toEqual([
      ["2026-10-27", ""],
      ["2026-10-28", "not_approved"],
      ["2026-10-29", "no_care_day"],
      ["2026-10-30", "other_form"],
      ["2026-10-31", "no_record"],
      ["2026-11-01", ""],
      ["2026-11-02", "no_record"],
    ]);
    expect(body.days[0].record).toEqual({
      id: "rec-2026-10-27",
      care_date: "2026-10-27",
      visit_start: "14:00:00",
      visit_end: "17:00:00",
      form_type: "12",
      form_fields: { total_minutes: 180 },
      verified: "verified",
      is_training: false,
      items: [
        {
          item_key: "meal",
          value_ko: "점심 절반 드심",
          status: "observed",
          detail: {},
          resolution: null,
        },
      ],
      worker_name: "가상 작성자",
    });
    expect(body.days[1].record).toBeNull();
    // 기간 조회는 from~to로, 항목은 승인한 기록 2건만
    expect(deps.listRecords).toHaveBeenCalledWith("res-1", "2026-10-27", "2026-11-02");
    expect(deps.listItems).toHaveBeenCalledWith(["rec-2026-10-27", "rec-2026-11-01"]);
  });

  it("시설(제16호)은 3칸이고 교육용 기관이면 is_training", async () => {
    const deps = fakeDeps({ ...facility, is_training: true }, [
      row({ care_date: "2026-11-02", form_type: "16", visit_start: null, visit_end: null }),
    ]);
    const r = await printPeriod("res-2", "2026-11-01", deps);
    const body = r.body as { to: string; is_training: boolean; days: { skipped: string }[] };
    expect(body.to).toBe("2026-11-03");
    expect(body.is_training).toBe(true);
    expect(body.days.map((day) => day.skipped)).toEqual(["no_record", "", "no_record"]);
  });

  it("같은 날 다른 서식 기록이 있어도 지금 서식의 승인 기록이 이긴다", async () => {
    const deps = fakeDeps(home, [
      row({ id: "other", care_date: "2026-10-27", form_type: "16" }),
      row({ id: "mine", care_date: "2026-10-27" }),
    ]);
    const r = await printPeriod("res-1", "2026-10-27", deps);
    const body = r.body as { days: { record: { id: string } | null }[] };
    expect(body.days[0].record?.id).toBe("mine");
  });

  it("승인한 날이 하루도 없으면 409 not_approved", async () => {
    const deps = fakeDeps(home, [row({ care_date: "2026-10-27", status: "returned" })]);
    expect(await printPeriod("res-1", "2026-10-27", deps)).toEqual({
      status: 409,
      body: { error: "not_approved" },
    });
    expect(deps.listItems).not.toHaveBeenCalled();
  });

  it.each([null, "", "2026-13-01", "26-11-01", "2026-11-04"])(
    "from이 %s이면 400 invalid_input",
    async (from) => {
      const deps = fakeDeps(home, [row({ care_date: "2026-11-01" })]);
      expect(await printPeriod("res-1", from, deps)).toEqual({
        status: 400,
        body: { error: "invalid_input" },
      });
      expect(deps.findResident).not.toHaveBeenCalled();
    },
  );

  it("오늘을 시작 날짜로 고를 수 있다", async () => {
    const deps = fakeDeps(home, [row({ care_date: TODAY })]);
    expect((await printPeriod("res-1", TODAY, deps)).status).toBe(200);
  });

  it("작성자는 403, 로그인 안 하면 401, 다른 기관 어르신은 404", async () => {
    const worker = fakeDeps(home, [], {
      currentUser: vi.fn(async () => ({ id: "w", role: "worker" as const })),
    });
    expect((await printPeriod("res-1", "2026-11-01", worker)).body.error).toBe("reviewer_only");
    const noUser = fakeDeps(home, [], { currentUser: vi.fn(async () => null) });
    expect((await printPeriod("res-1", "2026-11-01", noUser)).status).toBe(401);
    expect(await printPeriod("res-9", "2026-11-01", fakeDeps(null, []))).toEqual({
      status: 404,
      body: { error: "resident_not_found" },
    });
  });
});
