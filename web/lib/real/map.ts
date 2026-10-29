// 실제 Supabase에서 읽은 줄을 화면이 쓰는 모양(DemoDb)으로 바꾼다. 화면 코드는 Mock과 같은 모양을 그대로 읽는다.
// 근거: 문서/설계/데이터구조-v1.6.4.md 표 구조·상태 값. 계산(못 쓴 기록·지연전송 기록)은 DB 함수 결과를 그대로 쓴다.
import type { ItemKey, ItemStatus, RecordStatus, Resolution } from "../demo/state";
import type {
  DemoDb,
  DemoRecord,
  DraftState,
  EventType,
  FontSize,
  NoCareDay,
  NoCareReason,
  RecordEvent,
  RecordItem,
  Resident,
} from "../demo/store";

export type ProfileRow = {
  id: string;
  role: "worker" | "reviewer";
  name: string;
  native_lang: "ko" | "vi";
  font_size: number;
  onboarded: boolean;
  org_name: string;
};
export type ResidentRow = { id: string; alias: string; care_type: "facility" | "home" };
export type AssignmentRow = {
  resident_id: string;
  worker_id: string;
  visit_days: number[] | null;
  start_date: string;
};
export type RecordRow = {
  id: string;
  resident_id: string;
  worker_id: string;
  care_date: string;
  form_type: number;
  status: RecordStatus;
  transcript: string;
  transcript_ko: string;
  visit_start: string | null;
  visit_end: string | null;
  form_fields: Record<string, unknown> | null;
  return_reason: string;
  return_reason_native: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};
export type ItemRow = {
  record_id: string;
  item_key: ItemKey;
  value_ko: string;
  value_native: string;
  status: ItemStatus;
  evidence: string;
  reason: string;
  reason_native: string;
  source: "ai" | "worker" | "reviewer";
  confirmed_by_worker: boolean;
  resolution: Resolution;
  resolution_note: string;
  detail: Record<string, unknown> | null;
};
export type EventRow = {
  record_id: string;
  actor_id: string | null;
  type: EventType;
  item_key: ItemKey | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};
export type AudioJobRow = {
  record_id: string | null;
  target: "record" | "item" | "helper";
  status: "uploaded" | "transcribing" | "filling" | "done" | "failed";
  created_at: string;
};
export type NoCareRow = {
  resident_id: string;
  care_date: string;
  reason: NoCareReason;
  note: string;
  created_by: string;
};
export type StaffRow = { id: string; name: string; role: "worker" | "reviewer" };
/** join_codes 줄(관리자만 자기 기관 것을 RLS로 읽음). 코드 값은 DB에만 있고 저장소에는 두지 않는다(로그인가입 결정 6) */
export type JoinCodeRow = { code: string; role: "worker" | "reviewer"; active: boolean };
export type JoinCode = { role: "worker" | "reviewer"; code: string };

/** M5 설정의 가입 코드: 켜진(active) 것만, 작성자용 먼저. 관리자용은 화면에 보이지 않지만 자료는 같이 둔다(이슈 #119) */
export function activeJoinCodes(rows: JoinCodeRow[]): JoinCode[] {
  return rows
    .filter((row) => row.active)
    .map((row) => ({ role: row.role, code: row.code }))
    .sort((a, b) =>
      a.role === b.role ? a.code.localeCompare(b.code) : a.role === "worker" ? -1 : 1,
    );
}

export type RealRows = {
  profile: ProfileRow;
  staff: StaffRow[];
  residents: ResidentRow[];
  assignments: AssignmentRow[];
  records: RecordRow[];
  items: ItemRow[];
  events: EventRow[];
  jobs: AudioJobRow[];
  noCareDays: NoCareRow[];
};

const FONT: Record<number, FontSize> = { 1: "small", 2: "normal", 3: "large" };
export const FONT_VALUE: Record<FontSize, number> = { small: 1, normal: 2, large: 3 };

const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null);

/** 담당 연결이 여럿이면(관리자 화면) 가장 이른 시작일과 방문 요일 합집합을 쓴다 */
export function mapResidents(
  residents: ResidentRow[],
  assignments: AssignmentRow[],
  today: string,
): Resident[] {
  return residents
    .map((row) => {
      const links = assignments.filter((a) => a.resident_id === row.id);
      const startDate = links.map((a) => a.start_date).sort()[0] ?? today;
      const days =
        row.care_type === "home"
          ? [...new Set(links.flatMap((a) => a.visit_days ?? []))].sort((a, b) => a - b)
          : null;
      return {
        id: row.id,
        alias: row.alias,
        initial: [...row.alias][0] ?? "",
        careType: row.care_type,
        visitDays: days && days.length > 0 ? days : row.care_type === "home" ? [] : null,
        visitTime: null,
        // 실제 기록에서는 쓰지 않는 값(Mock 합성 사례 번호)
        caseId: row.care_type === "home" ? "S-H01" : "S-F01",
        startDate,
      } satisfies Resident;
    })
    .sort((a, b) => a.alias.localeCompare(b.alias, "ko"));
}

/** 정리 중·실패는 기록 전체 녹음 작업(audio_jobs)의 마지막 상태로 본다 */
export function draftStateOf(record: RecordRow, items: ItemRow[], jobs: AudioJobRow[]): DraftState {
  const last = jobs
    .filter((job) => job.record_id === record.id && job.target === "record")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (last && ["uploaded", "transcribing", "filling"].includes(last.status)) return "processing";
  if (last?.status === "failed") return "failed";
  const touched = items.some(
    (item) => item.source !== "ai" || item.status !== "not_mentioned" || item.confirmed_by_worker,
  );
  return record.transcript.trim() || touched ? "ready" : "empty";
}

/** 입력 방법: 기록 전체 녹음 작업(audio_jobs.target = record)이 있으면 음성, 없고 원문만 있으면 글(이슈 #135).
 *  글로 쓴 기록을 음성으로 보면 W3 ‘정리 중’에 “음성을 글자로” 단계가 나오고 W2 · 글로 쓰기에 쓴 글이 다시 채워지지 않는다 */
export function inputModeOf(record: RecordRow, jobs: AudioJobRow[]): DemoRecord["inputMode"] {
  const voiced = jobs.some((job) => job.record_id === record.id && job.target === "record");
  return voiced ? "voice" : record.transcript ? "text" : null;
}

/** 항목 ‘수정’으로 치는 칸. DB의 출처 판정(record_items_guard_source)과 같다. [맞아요]·번역·사유만 바뀐 줄은 수정이 아니다 */
const EDIT_KEYS = ["value_ko", "status", "detail"];

/** record_events → 화면 이력. 요약 띠·M3 처리 이력이 쓴다(이슈 #124).
 *  - 항목 edited 줄은 내용(value_ko·status·detail)이 바뀐 것만 남긴다
 *  - returned 줄은 사유(after.return_reason), resolved 줄은 고른 값(after.resolution)을 note로
 *  - created 줄이 없으면 records.created_at으로 ‘작성’을 만든다 */
function mapEvents(
  row: RecordRow,
  events: EventRow[],
  nameOf: (id: string | null) => string,
  roleOf: (actorId: string | null) => RecordEvent["actor_role"],
): RecordEvent[] {
  const mapped: RecordEvent[] = events
    .filter(
      (event) =>
        !(
          event.type === "edited" &&
          event.item_key &&
          !EDIT_KEYS.some((key) => key in (event.after ?? {}))
        ),
    )
    .map((event) => {
      const role = roleOf(event.actor_id);
      const note =
        event.type === "returned"
          ? typeof event.after?.return_reason === "string"
            ? event.after.return_reason
            : row.return_reason
          : event.type === "resolved"
            ? typeof event.after?.resolution === "string"
              ? event.after.resolution
              : "reopened"
            : undefined;
      return {
        type: event.type,
        actor: event.actor_id ? nameOf(event.actor_id) : "AI",
        at: event.created_at,
        ...(role ? { actor_role: role } : {}),
        ...(event.item_key ? { item_key: event.item_key } : {}),
        ...(note ? { note } : {}),
      };
    });
  if (!mapped.some((event) => event.type === "created")) {
    mapped.unshift({
      type: "created",
      actor: nameOf(row.worker_id),
      actor_role: "worker",
      at: row.created_at,
    });
  }
  return mapped;
}

export function mapRecord(
  row: RecordRow,
  rows: Pick<RealRows, "items" | "events" | "jobs">,
  nameOf: (id: string | null) => string,
): DemoRecord {
  const events = rows.events
    .filter((event) => event.record_id === row.id)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const rowItems = rows.items.filter((item) => item.record_id === row.id);
  const lastReturned = [...events].reverse().find((event) => event.type === "returned");
  const firstSubmitted = events.find((event) => event.type === "submitted");
  // 누가 했는지는 actor_id로 가른다(기록의 작성자면 worker, 그 밖의 사람은 reviewer, 서버·AI는 비움).
  // 이름으로 가르면 관리자가 여럿인 기관에서 어긋난다.
  const roleOf = (actorId: string | null): RecordEvent["actor_role"] =>
    actorId === null ? undefined : actorId === row.worker_id ? "worker" : "reviewer";
  const isReviewer = (event: EventRow) =>
    event.actor_id !== null && event.actor_id !== row.worker_id;
  const items: RecordItem[] = rowItems.map((item) => {
    const detail = { ...(item.detail ?? {}) };
    // 방문 시간은 records.visit_start·visit_end에 있다. 화면은 visit_time 항목 detail.start·end로 읽는다
    if (item.item_key === "visit_time") {
      if (row.visit_start && detail.start === undefined) detail.start = hhmm(row.visit_start);
      if (row.visit_end && detail.end === undefined) detail.end = hhmm(row.visit_end);
    }
    // 고치기 전 내용: 관리자가 고친(edited) 줄이나 [기록 안 함]으로 비운(resolved) 줄의 before.value_ko
    const reviewerEdit =
      item.source === "reviewer"
        ? [...events]
            .reverse()
            .find(
              (event) =>
                (event.type === "edited" || event.type === "resolved") &&
                isReviewer(event) &&
                event.item_key === item.item_key &&
                typeof event.before?.value_ko === "string",
            )
        : undefined;
    return {
      item_key: item.item_key,
      status: item.status,
      value_ko: item.value_ko,
      value_native: item.value_native,
      evidence: item.evidence,
      reason: item.reason,
      reason_native: item.reason_native,
      confirmed_by_worker: item.confirmed_by_worker,
      source: item.source,
      resolution: item.resolution,
      ...(Object.keys(detail).length > 0 ? { detail } : {}),
      ...(item.resolution_note ? { resolution_note: item.resolution_note } : {}),
      ...(reviewerEdit ? { before_ko: reviewerEdit.before?.value_ko as string } : {}),
    };
  });
  const formFields = pickFormFields(row.form_fields);
  return {
    id: row.id,
    residentId: row.resident_id,
    careDate: row.care_date,
    formType: row.form_type === 12 ? "12" : "16",
    status: row.status,
    draftState: draftStateOf(row, rowItems, rows.jobs),
    inputMode: inputModeOf(row, rows.jobs),
    transcript: row.transcript,
    transcriptKo: row.transcript_ko,
    items,
    returnReason: row.return_reason,
    returnReasonNative: row.return_reason_native,
    returnedBy: lastReturned ? nameOf(lastReturned.actor_id) : "",
    returnedAt: lastReturned?.created_at ?? null,
    firstSubmittedAt: firstSubmitted?.created_at ?? row.submitted_at,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by ? nameOf(row.approved_by) : "",
    formFields,
    updatedAt: events[events.length - 1]?.created_at ?? row.created_at,
    events: mapEvents(row, events, nameOf, roleOf),
    workerName: nameOf(row.worker_id),
  };
}

/** GET /api/records/:id/print 응답 */
export type PrintData = {
  form_type: "16" | "12";
  form_fields: Record<string, unknown>;
  visit_start: string | null;
  visit_end: string | null;
  verified: "verified" | "provisional";
  is_training: boolean;
  items: {
    item_key: ItemKey;
    value_ko: string;
    status: ItemStatus;
    detail: Record<string, unknown> | null;
    resolution: Resolution;
  }[];
};

/**
 * form_fields 중 화면·인쇄가 쓰는 값만 남긴다: 숫자(총시간·실수 횟수), 글자(변화상태 *_trend), null.
 * 글자를 버리면 제12호 변화상태 칸이 비어 인쇄된다(이슈 #123).
 */
export function pickFormFields(
  raw: Record<string, unknown> | null | undefined,
): Record<string, number | string | null> {
  return Object.fromEntries(
    Object.entries(raw ?? {}).filter(
      ([, v]) => typeof v === "number" || typeof v === "string" || v === null,
    ),
  ) as Record<string, number | string | null>;
}

/** 인쇄는 서버의 인쇄 데이터(승인한 기록만)로 칸을 채운다 */
export function applyPrintData(record: DemoRecord, data: PrintData): DemoRecord {
  return {
    ...record,
    formType: data.form_type,
    formFields: pickFormFields(data.form_fields),
    items: record.items.map((item) => {
      const printed = data.items.find((entry) => entry.item_key === item.item_key);
      if (!printed) return item;
      const detail = { ...(printed.detail ?? {}) };
      if (item.item_key === "visit_time") {
        if (data.visit_start) detail.start = hhmm(data.visit_start);
        if (data.visit_end) detail.end = hhmm(data.visit_end);
      }
      return {
        ...item,
        value_ko: printed.value_ko,
        status: printed.status,
        resolution: printed.resolution,
        ...(Object.keys(detail).length > 0 ? { detail } : {}),
      };
    }),
  };
}

export function mapNoCare(rows: NoCareRow[], nameOf: (id: string | null) => string): NoCareDay[] {
  return rows.map((row) => ({
    residentId: row.resident_id,
    careDate: row.care_date,
    reason: row.reason,
    note: row.note,
    createdBy: nameOf(row.created_by),
  }));
}

export function toDemoDb(rows: RealRows, today: string): DemoDb {
  const names = new Map(rows.staff.map((person) => [person.id, person.name]));
  names.set(rows.profile.id, rows.profile.name);
  const fallback = rows.profile.role === "worker" ? "관리자" : "작성자";
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? fallback) : "");
  const isWorker = rows.profile.role === "worker";
  const firstWorker = rows.staff.find((person) => person.role === "worker");
  return {
    version: 4,
    seededOn: today,
    worker: {
      name: isWorker ? rows.profile.name : (firstWorker?.name ?? ""),
      email: "",
      org: rows.profile.org_name,
    },
    reviewer: { name: isWorker ? "" : rows.profile.name },
    onboarded: rows.profile.onboarded,
    fontSize: FONT[rows.profile.font_size] ?? "normal",
    residents: mapResidents(rows.residents, rows.assignments, today),
    records: Object.fromEntries(rows.records.map((row) => [row.id, mapRecord(row, rows, nameOf)])),
    noCareDays: mapNoCare(rows.noCareDays, nameOf),
  };
}
