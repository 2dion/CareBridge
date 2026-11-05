import { describe, expect, it } from "vitest";
import { createDemoDb } from "@/lib/demo/store";
import { missingAreas, mockPeriod, periodHref, periodStart, serverPeriod } from "./period-view";

describe("기간 인쇄 화면", () => {
  it("서식과 진입 경로에 맞는 시작 날짜", () => {
    expect(periodStart("2026-11-01", "12")).toBe("2026-10-26");
    expect(periodStart("2026-11-04", "16")).toBe("2026-11-02");
    expect(periodStart("2026-11-04", "16", true)).toBe("2026-11-04");
  });
  it("상세 진입 기간은 예전 기록의 서식과 달라도 지금 급여 종류로 정한다", () => {
    const db = createDemoDb("2026-11-04");
    const record = { ...Object.values(db.records)[0], careDate: "2026-11-04" };
    expect(periodHref({ ...record, formType: "12" }, "facility")).toBe(
      `/print/period?resident=${record.residentId}&from=2026-11-04`,
    );
    expect(periodHref({ ...record, formType: "16" }, "home")).toBe(
      `/print/period?resident=${record.residentId}&from=2026-11-02`,
    );
  });
  it("제16호 특이사항은 기록 안 함과 언급 없음을 빼고 날짜마다 영역을 요구한다", () => {
    const db = createDemoDb("2026-11-04");
    const resident = db.residents.find((entry) => entry.careType === "facility")!;
    const base = Object.values(db.records).find(
      (entry) => entry.residentId === resident.id && entry.status === "approved",
    )!;
    const recordFor = (careDate: string) => ({
      ...base,
      id: careDate,
      careDate,
      items: base.items.map((item) =>
        item.item_key === "notes"
          ? { ...item, value_ko: "합성 관찰", status: "observed" as const, resolution: null }
          : item,
      ),
    });
    db.records = Object.fromEntries(
      ["2026-11-02", "2026-11-03"].map((date) => [date, recordFor(date)]),
    );
    const view = mockPeriod(db, resident.id, "2026-11-02");
    expect(missingAreas(view, {})).toBe(false);
    expect(missingAreas(view, { "2026-11-02": [] })).toBe(true);
    expect(missingAreas(view, { "2026-11-02": ["physical"] })).toBe(false);
    expect(missingAreas(view, { "2026-11-02": ["physical"], "2026-11-03": ["health"] })).toBe(
      false,
    );
    view.days[0].record!.items.find((item) => item.item_key === "notes")!.resolution = "omitted";
    view.days[1].record!.items.find((item) => item.item_key === "notes")!.status = "not_mentioned";
    expect(missingAreas(view, {})).toBe(false);
  });
  it("빈 날짜 열을 유지하며 승인 전과 다른 서식을 제외한다", () => {
    const db = createDemoDb("2026-11-04");
    const resident = db.residents.find((entry) => entry.careType === "home")!;
    const base = Object.values(db.records)[0];
    db.records = Object.fromEntries(
      [
        {
          ...base,
          id: "a",
          residentId: resident.id,
          careDate: "2026-10-29",
          formType: "12" as const,
          status: "approved" as const,
        },
        {
          ...base,
          id: "b",
          residentId: resident.id,
          careDate: "2026-10-27",
          formType: "12" as const,
          status: "submitted" as const,
        },
        {
          ...base,
          id: "c",
          residentId: resident.id,
          careDate: "2026-10-28",
          formType: "16" as const,
          status: "approved" as const,
        },
      ].map((entry) => [entry.id, entry]),
    );
    db.noCareDays = [
      {
        residentId: resident.id,
        careDate: "2026-10-30",
        reason: "hospital",
        note: "",
        createdBy: "가상 작성자",
      },
    ];
    const view = mockPeriod(db, resident.id, "2026-10-26");
    expect(view.days).toHaveLength(7);
    expect(view.days.map((day) => day.skipped)).toEqual([
      "no_record",
      "not_approved",
      "other_form",
      "",
      "no_care_day",
      "no_record",
      "no_record",
    ]);
    expect(view.days[3].record?.id).toBe("a");
  });
  it("서버 항목만 사용하고 제16호 특이사항 영역을 요구한다", () => {
    const view = serverPeriod({
      resident: { id: "r", name: "가상 어르신" },
      from: "2026-11-01",
      to: "2026-11-03",
      form_type: "16",
      is_training: true,
      days: [
        {
          care_date: "2026-11-01",
          skipped: "",
          record: {
            id: "a",
            care_date: "2026-11-01",
            worker_name: "가상 작성자",
            form_type: "16",
            form_fields: {},
            visit_start: null,
            visit_end: null,
            verified: "verified",
            is_training: true,
            items: [
              {
                item_key: "notes",
                value_ko: "창가에서 쉬심",
                status: "observed",
                detail: {},
                resolution: null,
              },
            ],
          },
        },
      ],
    });
    expect(view.training).toBe(true);
    expect(view.days[0].record?.workerName).toBe("가상 작성자");
    expect(view.days[0].record?.items).toHaveLength(1);
    // 건드리지 않으면 4개 모두라서 막지 않고, 모두 끈 날만 막는다(이슈 #321)
    expect(missingAreas(view, {})).toBe(false);
    expect(missingAreas(view, { "2026-11-01": [] })).toBe(true);
    expect(missingAreas(view, { "2026-11-01": ["physical"] })).toBe(false);
  });
});

// 이슈 #317: 끝 날짜를 주면 서식 한 장을 넘는 기간도 날마다 한 줄
describe("기간 인쇄 끝 날짜", () => {
  it("to가 없으면 서식 한 장 분량, 있으면 from~to", () => {
    const db = createDemoDb("2026-11-04");
    const resident = db.residents.find((entry) => entry.careType === "facility")!;
    expect(mockPeriod(db, resident.id, "2026-11-01").days).toHaveLength(3);
    const view = mockPeriod(db, resident.id, "2026-11-01", "2026-11-05");
    expect(view.days.map((day) => day.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
    expect(view.to).toBe("2026-11-05");
  });
});
