import { describe, expect, it } from "vitest";

import { processHistory, sourceSummary } from "../demo/review";
import { residentWorkerNames } from "../demo/store";
import { actionError, audioMime } from "./actions";
import {
  activeJoinCodes,
  applyPrintData,
  draftStateOf,
  type EventRow,
  inputModeOf,
  type ItemRow,
  mapAssignments,
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
      [{ id: "res-1", name: "이○○ 어르신", care_type: "home" }],
      [
        {
          resident_id: "res-1",
          worker_id: "w1",
          visit_days: [1, 3],
          start_date: "2026-10-21",
          schedule: "",
        },
        {
          resident_id: "res-1",
          worker_id: "w2",
          visit_days: [3, 5],
          start_date: "2026-10-10",
          schedule: "14:00~17:00",
        },
      ],
      "2026-10-28",
    );
    // 표시용 방문 시간은 assignments.schedule에서 읽는다(이슈 #96)
    expect(resident).toMatchObject({
      initial: "이",
      careType: "home",
      visitDays: [1, 3, 5],
      startDate: "2026-10-10",
      visitTime: "14:00~17:00",
    });
  });

  // 이슈 #95: M4는 담당 연결을 작성자마다 한 줄로 보인다
  it("담당 연결 줄은 작성자마다 그대로 남긴다", () => {
    expect(
      mapAssignments([
        {
          resident_id: "res-1",
          worker_id: "w1",
          visit_days: null,
          start_date: "2026-10-21",
          schedule: " ",
        },
      ]),
    ).toEqual([
      {
        residentId: "res-1",
        workerId: "w1",
        visitDays: null,
        startDate: "2026-10-21",
        visitTime: null,
      },
    ]);
  });

  it("시설은 매일(visitDays null)", () => {
    const [resident] = mapResidents(
      [{ id: "r", name: "김○○ 어르신", care_type: "facility" }],
      [],
      "2026-10-28",
    );
    expect(resident.visitDays).toBeNull();
    expect(resident.startDate).toBe("2026-10-28");
  });
});

describe("activeJoinCodes", () => {
  // 값은 DB 코드 형식(대문자·숫자 8자 이상)에 맞지 않는 자리표시자. 실제 코드는 저장소에 두지 않는다(이슈 #119)
  it("켜진 코드만, 작성자용 먼저", () => {
    expect(
      activeJoinCodes([
        { code: "r-code", role: "reviewer", active: true },
        { code: "w-old", role: "worker", active: false },
        { code: "w-code", role: "worker", active: true },
      ]),
    ).toEqual([
      { role: "worker", code: "w-code" },
      { role: "reviewer", code: "r-code" },
    ]);
    expect(activeJoinCodes([])).toEqual([]);
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

// 이슈 #135: 글로 쓴 기록을 음성으로 보면 ‘정리 중’에 “음성을 글자로” 단계가 나오고 쓴 글이 다시 채워지지 않는다
describe("inputModeOf", () => {
  const recordJob = {
    record_id: "rec-1",
    target: "record" as const,
    status: "done" as const,
    created_at: "1",
  };
  it("기록 전체 녹음 작업이 있으면 음성", () => {
    expect(inputModeOf(record, [recordJob])).toBe("voice");
  });

  it("녹음 작업 없이 원문만 있으면 글(항목 보태기 녹음은 세지 않음)", () => {
    expect(inputModeOf(record, [])).toBe("text");
    expect(inputModeOf(record, [{ ...recordJob, target: "item" }])).toBe("text");
    expect(inputModeOf(record, [{ ...recordJob, record_id: "rec-2" }])).toBe("text");
  });

  it("둘 다 없으면 null", () => {
    expect(inputModeOf({ ...record, transcript: "" }, [])).toBeNull();
  });

  it("mapRecord도 같은 값을 쓴다", () => {
    const text = mapRecord(record, { items: [], events: [], jobs: [] }, () => "");
    const voice = mapRecord(record, { items: [], events: [], jobs: [recordJob] }, () => "");
    expect([text.inputMode, voice.inputMode]).toEqual(["text", "voice"]);
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

// 이슈 #124: 되돌림 → 작성자 고침 → 재전송 → 관리자 수정·[확인함]·[기록 안 함] → 승인.
// DB는 관리자가 손댄 항목의 source를 reviewer로 바꾸므로(record_items_guard_source) 요약 띠·이력은 record_events로 본다.
describe("mapRecord 이력(record_events)", () => {
  const names = (id: string | null) => (id === "rv" ? "박 관리자" : id === "w1" ? "마이" : "");
  const ev = (
    at: string,
    actor_id: string | null,
    type: EventRow["type"],
    rest: Partial<Pick<EventRow, "item_key" | "before" | "after">> = {},
  ): EventRow => ({
    record_id: "rec-1",
    actor_id,
    type,
    item_key: null,
    before: null,
    after: null,
    created_at: `2026-10-28T${at}:00Z`,
    ...rest,
  });
  const flow: EventRow[] = [
    ev("00:00", "w1", "created", { after: { status: "draft" } }),
    ev("00:01", null, "ai_filled", { item_key: "sleep", after: { value_ko: "잘 못 잠" } }),
    // [확인 완료]만 누른 줄은 수정이 아니다
    ev("00:02", "w1", "edited", { item_key: "meal", after: { confirmed_by_worker: true } }),
    ev("00:10", "w1", "submitted", { before: { status: "draft" }, after: { status: "submitted" } }),
    ev("01:00", "rv", "returned", {
      before: { status: "submitted" },
      after: { status: "returned", return_reason: "[수면] 다시 확인해 주세요" },
    }),
    ev("02:00", "w1", "edited", {
      item_key: "sleep",
      before: { value_ko: "잘 못 잠", source: "ai" },
      after: { value_ko: "밤에 두 번 깸", source: "worker", resolution: null },
    }),
    ev("02:10", "w1", "submitted", {
      before: { status: "returned" },
      after: { status: "submitted" },
    }),
    ev("03:00", "rv", "edited", {
      item_key: "sleep",
      before: { value_ko: "밤에 두 번 깸", source: "worker" },
      after: { value_ko: "밤에 두 번 깨어 화장실 다녀옴", source: "reviewer" },
    }),
    // 서버가 다시 번역한 줄(actor 없음, 번역만)도 수정이 아니다
    ev("03:01", null, "edited", { item_key: "sleep", after: { value_native: "Đêm thức hai lần" } }),
    ev("03:05", "rv", "resolved", {
      item_key: "sleep",
      before: { resolution: null },
      after: { resolution: "confirmed_by_reviewer" },
    }),
    ev("03:10", "rv", "resolved", {
      item_key: "next_check",
      before: { value_ko: "혈압 다시 확인", resolution: null },
      after: { value_ko: "", resolution: "omitted", source: "reviewer" },
    }),
    ev("04:00", "rv", "approved", {
      before: { status: "submitted" },
      after: { status: "approved" },
    }),
  ];
  const mapped = mapRecord(
    { ...record, status: "approved", approved_at: "2026-10-28T04:00:00Z", approved_by: "rv" },
    {
      items: [
        item("sleep", {
          status: "needs_check",
          source: "reviewer",
          value_ko: "밤에 두 번 깨어 화장실 다녀옴",
          resolution: "confirmed_by_reviewer",
        }),
        item("meal", {
          status: "observed",
          source: "ai",
          value_ko: "절반 드심",
          confirmed_by_worker: true,
        }),
        item("next_check", {
          status: "needs_check",
          source: "reviewer",
          resolution: "omitted",
          resolution_note: "원문에 없음",
        }),
      ],
      events: flow,
      jobs: [],
    },
    names,
  );

  it("누가 했는지는 actor_id로(작성자 worker, 그 밖 reviewer, 서버·AI는 비움), 사유·고른 값은 note로", () => {
    expect(mapped.events.map((event) => [event.type, event.actor_role ?? "-"])).toEqual([
      ["created", "worker"],
      ["ai_filled", "-"],
      ["submitted", "worker"],
      ["returned", "reviewer"],
      ["edited", "worker"],
      ["submitted", "worker"],
      ["edited", "reviewer"],
      ["resolved", "reviewer"],
      ["resolved", "reviewer"],
      ["approved", "reviewer"],
    ]);
    expect(mapped.events.find((event) => event.type === "returned")?.note).toBe(
      "[수면] 다시 확인해 주세요",
    );
    expect(
      mapped.events.filter((event) => event.type === "resolved").map((event) => event.note),
    ).toEqual(["confirmed_by_reviewer", "omitted"]);
  });

  it("요약 띠: 관리자가 같은 항목을 고쳐도 작성자 수정이 남고, [기록 안 함]은 수정으로 세지 않는다", () => {
    expect(sourceSummary(mapped)).toEqual({ worker: ["sleep"], reviewer: ["sleep"], aiCount: 2 });
  });

  it("처리 이력: 첫 전송·검토·되돌림(사유)·재전송(고친 항목)·검토(수정·확인 처리)·승인이 순서대로", () => {
    const steps = processHistory(mapped);
    expect(steps.map((step) => step.kind)).toEqual([
      "created",
      "submitted",
      "returned",
      "resubmitted",
      "reviewed",
      "approved",
    ]);
    expect(steps[0]).toMatchObject({ actor: "마이", at: "2026-10-28T00:00:00Z" });
    expect(steps[2]).toMatchObject({ actor: "박 관리자", reason: "[수면] 다시 확인해 주세요" });
    expect(steps[3]).toMatchObject({ actor: "마이", edited: ["sleep"] });
    expect(steps[4]).toMatchObject({
      actor: "박 관리자",
      at: "2026-10-28T03:10:00Z",
      edited: ["sleep"],
      resolved: [
        { item_key: "sleep", resolution: "confirmed_by_reviewer" },
        { item_key: "next_check", resolution: "omitted" },
      ],
    });
  });

  // 이슈 #140: "확인함 ·"처럼 사람·시각이 비던 문제. 가장 최근 resolved 줄의 actor·created_at
  it("[확인함]·[기록 안 함]을 누가 언제 골랐는지 resolved 줄에서 채운다", () => {
    expect(mapped.items.find((entry) => entry.item_key === "sleep")).toMatchObject({
      resolved_by: "박 관리자",
      resolved_at: "2026-10-28T03:05:00Z",
    });
    expect(mapped.items.find((entry) => entry.item_key === "next_check")).toMatchObject({
      resolved_by: "박 관리자",
      resolved_at: "2026-10-28T03:10:00Z",
    });
    expect(mapped.items.find((entry) => entry.item_key === "meal")).not.toHaveProperty(
      "resolved_by",
    );
  });

  it("[기록 안 함]으로 비운 항목도 고치기 전 내용을 이력에서 찾는다", () => {
    expect(mapped.items.find((entry) => entry.item_key === "next_check")?.before_ko).toBe(
      "혈압 다시 확인",
    );
  });

  it("created 줄이 없으면 records.created_at으로 ‘작성’을 만든다", () => {
    const noCreated = mapRecord(record, { items: [], events: [flow[3]], jobs: [] }, names);
    expect(noCreated.events[0]).toMatchObject({
      type: "created",
      actor: "마이",
      actor_role: "worker",
      at: "2026-10-27T08:00:00Z",
    });
    expect(processHistory(noCreated).map((step) => step.kind)).toEqual(["created", "submitted"]);
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
          email: "worker@example.com",
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
    expect(db.worker).toMatchObject({
      name: "마이",
      org: "데모 요양센터",
      email: "worker@example.com",
    });
    expect(db.fontSize).toBe("large");
    expect(db.records["rec-1"].status).toBe("returned");
    // 작성자 화면은 직원 목록을 두지 않는다
    expect(db.staff).toBeUndefined();
  });

  it("관리자 화면은 직원 목록과 담당 연결 줄을 함께 둔다(이슈 #95)", () => {
    const db = toDemoDb(
      {
        profile: {
          id: "rv",
          role: "reviewer",
          name: "박 관리자",
          email: "reviewer@example.com",
          native_lang: "ko",
          font_size: 2,
          onboarded: true,
          org_name: "데모 요양센터",
        },
        staff: [
          { id: "w1", name: "마이", role: "worker", native_lang: "vi" },
          { id: "w2", name: "린", role: "worker", native_lang: "ko" },
        ],
        residents: [{ id: "res-1", name: "이○○ 어르신", care_type: "facility" }],
        assignments: [
          {
            resident_id: "res-1",
            worker_id: "w2",
            visit_days: null,
            start_date: "2026-10-01",
            schedule: "",
          },
        ],
        records: [],
        items: [],
        events: [],
        jobs: [],
        noCareDays: [],
      },
      "2026-10-28",
    );
    expect(db.staff?.map((person) => person.name)).toEqual(["마이", "린"]);
    expect(db.staff?.map((person) => person.nativeLang)).toEqual(["vi", "ko"]);
    expect(db.assignments).toEqual([
      {
        residentId: "res-1",
        workerId: "w2",
        visitDays: null,
        startDate: "2026-10-01",
        visitTime: null,
      },
    ]);
    expect(residentWorkerNames(db, "res-1")).toEqual(["린"]);
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
