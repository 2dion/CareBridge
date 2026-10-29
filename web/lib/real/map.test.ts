import { describe, expect, it } from "vitest";

import { actionError, audioMime } from "./actions";
import {
  applyPrintData,
  draftStateOf,
  type ItemRow,
  mapRecord,
  mapResidents,
  type RecordRow,
  toDemoDb,
} from "./map";

const record: RecordRow = {
  id: "rec-1",
  resident_id: "res-1",
  worker_id: "w1",
  care_date: "2026-10-27",
  form_type: 12,
  status: "returned",
  transcript: "두 시부터 다섯 시까지 있었어요.",
  transcript_ko: "두 시부터 다섯 시까지 있었어요.",
  visit_start: "14:00:00",
  visit_end: "17:00:00",
  form_fields: { stool_accidents: 1, total_minutes: 180, note: "x" },
  return_reason: "[식사] 다시 확인해 주세요",
  return_reason_native: "",
  submitted_at: "2026-10-28T01:00:00Z",
  approved_at: null,
  approved_by: null,
  created_at: "2026-10-27T08:00:00Z",
};

const item = (key: ItemRow["item_key"], fields: Partial<ItemRow> = {}): ItemRow => ({
  record_id: "rec-1",
  item_key: key,
  value_ko: "",
  value_native: "",
  status: "not_mentioned",
  evidence: "",
  reason: "",
  reason_native: "",
  source: "ai",
  confirmed_by_worker: false,
  resolution: null,
  resolution_note: "",
  detail: {},
  ...fields,
});

describe("mapResidents", () => {
  it("담당 연결의 가장 이른 시작일과 방문 요일 합집합", () => {
    const [resident] = mapResidents(
      [{ id: "res-1", alias: "이○○ 어르신", care_type: "home" }],
      [
        { resident_id: "res-1", worker_id: "w1", visit_days: [1, 3], start_date: "2026-10-21" },
        { resident_id: "res-1", worker_id: "w2", visit_days: [3, 5], start_date: "2026-10-10" },
      ],
      "2026-10-28",
    );
    expect(resident).toMatchObject({
      initial: "이",
      careType: "home",
      visitDays: [1, 3, 5],
      startDate: "2026-10-10",
    });
  });

  it("시설은 매일(visitDays null)", () => {
    const [resident] = mapResidents(
      [{ id: "r", alias: "김○○ 어르신", care_type: "facility" }],
      [],
      "2026-10-28",
    );
    expect(resident.visitDays).toBeNull();
    expect(resident.startDate).toBe("2026-10-28");
  });
});

describe("draftStateOf", () => {
  const blank = { ...record, transcript: "" };
  it("기록 전체 녹음 작업이 도는 중이면 정리 중, 실패면 실패", () => {
    const job = (status: "filling" | "failed" | "done", at: string) => ({
      record_id: "rec-1",
      target: "record" as const,
      status,
      created_at: at,
    });
    expect(draftStateOf(blank, [], [job("filling", "2")])).toBe("processing");
    expect(draftStateOf(blank, [], [job("done", "1"), job("failed", "2")])).toBe("failed");
  });

  it("원문도 손댄 항목도 없으면 작성 전, 원문이 있으면 준비됨", () => {
    expect(draftStateOf(blank, [item("meal")], [])).toBe("empty");
    expect(draftStateOf(record, [item("meal")], [])).toBe("ready");
  });
});

describe("mapRecord", () => {
  const names = (id: string | null) => (id === "rv" ? "박 관리자" : id === "w1" ? "마이" : "");
  const mapped = mapRecord(
    record,
    {
      items: [
        item("visit_time", { status: "observed", value_ko: "14~17시 방문" }),
        item("meal", { source: "reviewer", value_ko: "절반 드심" }),
      ],
      events: [
        {
          record_id: "rec-1",
          actor_id: "w1",
          type: "submitted",
          item_key: null,
          before: null,
          after: null,
          created_at: "2026-10-28T00:00:00Z",
        },
        {
          record_id: "rec-1",
          actor_id: "rv",
          type: "edited",
          item_key: "meal",
          before: { value_ko: "조금 드심" },
          after: { value_ko: "절반 드심" },
          created_at: "2026-10-28T02:00:00Z",
        },
        {
          record_id: "rec-1",
          actor_id: "rv",
          type: "returned",
          item_key: null,
          before: null,
          after: null,
          created_at: "2026-10-28T03:00:00Z",
        },
      ],
      jobs: [],
    },
    names,
  );

  it("방문 시간은 records에서 visit_time detail.start·end로", () => {
    expect(mapped.items[0].detail).toMatchObject({ start: "14:00", end: "17:00" });
  });

  it("관리자가 고친 항목은 고치기 전 내용을 이력에서", () => {
    expect(mapped.items[1].before_ko).toBe("조금 드심");
  });

  it("되돌린 사람·처음 보낸 때·작성자 이름·숫자 서식 칸", () => {
    expect(mapped).toMatchObject({
      returnedBy: "박 관리자",
      firstSubmittedAt: "2026-10-28T00:00:00Z",
      workerName: "마이",
      formType: "12",
      formFields: { stool_accidents: 1, total_minutes: 180 },
      returnReasonNative: "",
    });
  });
});

describe("toDemoDb", () => {
  it("작성자 화면은 자기 이름과 글자 크기", () => {
    const db = toDemoDb(
      {
        profile: {
          id: "w1",
          role: "worker",
          name: "마이",
          native_lang: "vi",
          font_size: 3,
          onboarded: true,
          org_name: "데모 요양센터",
        },
        staff: [],
        residents: [],
        assignments: [],
        records: [record],
        items: [],
        events: [],
        jobs: [],
        noCareDays: [],
      },
      "2026-10-28",
    );
    expect(db.worker).toMatchObject({ name: "마이", org: "데모 요양센터" });
    expect(db.fontSize).toBe("large");
    expect(db.records["rec-1"].status).toBe("returned");
  });
});

describe("applyPrintData", () => {
  it("인쇄 데이터로 항목·서식 칸·방문 시간을 채움", () => {
    const base = mapRecord(
      record,
      { items: [item("meal"), item("visit_time")], events: [], jobs: [] },
      () => "",
    );
    const printed = applyPrintData(base, {
      form_type: "12",
      // 변화상태 글자 값은 남기고(제12호 인쇄, 이슈 #123), 객체 같은 다른 값은 버린다
      form_fields: { urine_accidents: 2, body_trend: "improved", extra: { x: 1 } },
      visit_start: "09:00:00",
      visit_end: "11:30:00",
      verified: "verified",
      is_training: false,
      items: [
        {
          item_key: "meal",
          value_ko: "절반 드심",
          status: "observed",
          detail: {},
          resolution: null,
        },
        {
          item_key: "visit_time",
          value_ko: "",
          status: "not_mentioned",
          detail: {},
          resolution: null,
        },
      ],
    });
    expect(printed.items[0].value_ko).toBe("절반 드심");
    expect(printed.items[1].detail).toMatchObject({ start: "09:00", end: "11:30" });
    expect(printed.formFields).toEqual({ urine_accidents: 2, body_trend: "improved" });
  });
});

describe("actions 도우미 함수", () => {
  it("녹음 형식을 두 가지로 맞춤", () => {
    expect(audioMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(audioMime("audio/mp4")).toBe("audio/mp4");
    expect(audioMime("audio/wav")).toBeNull();
  });

  it("키가 없으면 한국어·베트남어 안내", () => {
    expect(actionError("ai_not_configured")).toMatchObject({
      ok: false,
      ko: expect.stringContaining("AI"),
      vi: expect.stringContaining("AI"),
    });
    expect(actionError("unresolved_needs_check", ["meal"]).items).toEqual(["meal"]);
  });
});
