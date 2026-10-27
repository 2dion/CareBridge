// 작성자·담당자 화면이 함께 쓰는 Mock 데이터(브라우저 저장).
// 실제 API·Supabase가 붙기 전까지 화면이 같은 규칙(데이터구조 v1.6.2 공통 계약)으로 움직이게 한다.
// 상태 변화·승인 조건·못 쓴 기록 계산은 여기 코드가 맡고, AI에게 맡기지 않는다(AGENTS.md 원칙 5).
import f01 from "./s-f01.json";
import f05 from "./s-f05.json";
import h01 from "./s-h01.json";
import {
  countUnresolved,
  type Item,
  type ItemKey,
  type ItemStatus,
  type RecordStatus,
  itemOrder,
} from "./state";

export type CareType = "facility" | "home";
export type CaseId = "S-F01" | "S-F05" | "S-H01";
export type NoCareReason = "hospital" | "overnight" | "visit_cancelled" | "other";
export type DraftState = "empty" | "processing" | "ready" | "failed";
export type EventType =
  "created" | "ai_filled" | "edited" | "submitted" | "returned" | "approved" | "resolved";

export type Resident = {
  id: string;
  alias: string;
  initial: string;
  careType: CareType;
  /** 재가 방문 요일 1=월 … 7=일. 시설은 null(매일). */
  visitDays: number[] | null;
  visitTime: string | null;
  caseId: CaseId;
  startDate: string;
};

export type RecordItem = Item & {
  /** 담당자가 고치기 전 내용(W3 되돌아온 기록 ‘고치기 전’). */
  before_ko?: string;
  /** [기록 안 함] 사유. */
  resolution_note?: string;
  resolved_by?: string;
  resolved_at?: string;
};

export type RecordEvent = {
  type: EventType;
  actor: string;
  at: string;
  item_key?: ItemKey;
  note?: string;
};

export type DemoRecord = {
  id: string;
  residentId: string;
  careDate: string;
  formType: "16" | "12";
  status: RecordStatus;
  draftState: DraftState;
  /** 마지막으로 초안을 만든 방법(기록 시작 화면의 ‘임시저장’ 표시). */
  inputMode: "voice" | "text" | null;
  transcript: string;
  transcriptKo: string;
  items: RecordItem[];
  returnReason: string;
  returnReasonNative: string;
  returnedBy: string;
  returnedAt: string | null;
  firstSubmittedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string;
  /** 서식 칸 중 항목 밖 값(제12호 배변 실수 횟수: stool_accidents, urine_accidents). */
  formFields?: Record<string, number | null>;
  updatedAt: string;
  events: RecordEvent[];
};

export type NoCareDay = {
  residentId: string;
  careDate: string;
  reason: NoCareReason;
  note: string;
  createdBy: string;
};

export type FontSize = "small" | "normal" | "large";

export type DemoDb = {
  version: 2;
  seededOn: string;
  worker: { name: string; email: string; org: string };
  reviewer: { name: string };
  onboarded: boolean;
  fontSize: FontSize;
  residents: Resident[];
  records: Record<string, DemoRecord>;
  noCareDays: NoCareDay[];
};

export const DB_STORAGE_KEY = "carebridge-demo-db-v2";

const cases = { "S-F01": f01, "S-F05": f05, "S-H01": h01 } as const;

export const noCareReasonLabel: Record<NoCareReason, { ko: string; vi: string }> = {
  hospital: { ko: "입원", vi: "Nhập viện" },
  overnight: { ko: "하루 종일 외박", vi: "Vắng mặt cả ngày" },
  visit_cancelled: { ko: "방문 취소", vi: "Hủy thăm" },
  other: { ko: "기타 (직접 쓰기)", vi: "Khác" },
};

/** W3·R2 표시 순서: 별지 제12호·제16호처럼 인지 변화를 복약 관찰 앞에 둔다(화면 v1.3 W3 항목 순서). */
export const displayOrder: ItemKey[] = [
  "visit_time",
  "support",
  "meal",
  "sleep",
  "discomfort",
  "cognition",
  "medication",
  "notes",
  "next_check",
];

export function itemLabel(key: ItemKey) {
  const found = itemOrder.find((item) => item.key === key);
  return found ?? { key, ko: key, vi: "" };
}

// ---------- 날짜 (한국 시간) ----------

export function kstToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000,
  );
}

/** 1=월 … 7=일 (assignments.visit_days와 같은 값). */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

const weekdayKo = ["", "월", "화", "수", "목", "금", "토", "일"];

export function weekdayLabel(date: string): string {
  return weekdayKo[isoWeekday(date)];
}

export function monthDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일`;
}

export function monthDayWeek(date: string): string {
  return `${monthDay(date)} (${weekdayLabel(date)})`;
}

/** "14:00~17:00" → "오후 2:00 ~ 오후 5:00" (화면문구 v1.0: 시간은 글자로). */
export function timeRangeLabel(range: string | null): string {
  if (!range) return "";
  return range
    .split("~")
    .map((part) => {
      const [h, m] = part.trim().split(":").map(Number);
      const half = h < 12 ? "오전" : "오후";
      const hour = h % 12 === 0 ? 12 : h % 12;
      return `${half} ${hour}:${String(m).padStart(2, "0")}`;
    })
    .join(" ~ ");
}

export function kstTime(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function kstDateOf(iso: string): string {
  return kstToday(new Date(iso));
}

function at(date: string, time: string): string {
  return `${date}T${time}:00+09:00`;
}

// ---------- 시드 ----------

function caseItems(caseId: CaseId): RecordItem[] {
  return cases[caseId].draft.items.map((value) => ({
    item_key: value.item_key as ItemKey,
    status: value.status as ItemStatus,
    value_ko: value.value_ko,
    value_native: value.value_native,
    evidence: value.evidence,
    reason: value.reason,
    reason_native: "reason_native" in value ? String(value.reason_native ?? "") : "",
    confirmed: false,
    resolution: null,
    source: "ai" as const,
    ...("detail" in value && value.detail && typeof value.detail === "object"
      ? { detail: value.detail as Record<string, unknown> }
      : {}),
  }));
}

function caseTranscript(caseId: CaseId) {
  const data = cases[caseId];
  const transcriptKo =
    "transcript_ko" in data && typeof data.transcript_ko === "string"
      ? data.transcript_ko
      : data.draft.transcript_ko;
  return { transcript: data.transcript, transcriptKo: transcriptKo ?? data.transcript };
}

function emptyItems(): RecordItem[] {
  return itemOrder.map(({ key }) => ({
    item_key: key,
    status: "not_mentioned" as const,
    value_ko: "",
    value_native: "",
    evidence: "",
    reason: "",
    reason_native: "",
    confirmed: false,
    resolution: null,
    source: "ai" as const,
  }));
}

export function recordId(residentId: string, careDate: string) {
  return `${residentId}-${careDate}`;
}

function blankRecord(resident: Resident, careDate: string, now: string, actor: string): DemoRecord {
  return {
    id: recordId(resident.id, careDate),
    residentId: resident.id,
    careDate,
    formType: resident.careType === "home" ? "12" : "16",
    status: "draft",
    draftState: "empty",
    inputMode: null,
    transcript: "",
    transcriptKo: "",
    items: emptyItems(),
    returnReason: "",
    returnReasonNative: "",
    returnedBy: "",
    returnedAt: null,
    firstSubmittedAt: null,
    submittedAt: null,
    approvedAt: null,
    approvedBy: "",
    updatedAt: now,
    events: [{ type: "created", actor, at: now }],
  };
}

/** 사례 초안을 채운 기록(시드용). */
function filledRecord(resident: Resident, careDate: string, time: string, actor: string) {
  const created = at(careDate, time);
  const record = blankRecord(resident, careDate, created, actor);
  return {
    ...record,
    ...caseTranscript(resident.caseId),
    draftState: "ready" as const,
    inputMode: "voice" as const,
    items: caseItems(resident.caseId),
    events: [...record.events, { type: "ai_filled" as const, actor: "AI", at: created }],
  };
}

function confirmAll(record: DemoRecord): DemoRecord {
  return {
    ...record,
    items: record.items.map((item) =>
      item.status === "needs_check" ? item : { ...item, confirmed: true },
    ),
  };
}

function seedSubmitted(record: DemoRecord, time: string, actor: string): DemoRecord {
  const when = at(record.careDate, time);
  return {
    ...confirmAll(record),
    status: "submitted",
    firstSubmittedAt: when,
    submittedAt: when,
    updatedAt: when,
    events: [...record.events, { type: "submitted", actor, at: when }],
  };
}

function seedApproved(record: DemoRecord, reviewer: string): DemoRecord {
  const when = at(record.careDate, "11:00");
  return {
    ...record,
    status: "approved",
    approvedAt: when,
    approvedBy: reviewer,
    updatedAt: when,
    items: record.items.map((item) =>
      item.status === "needs_check" ? { ...item, resolution: "confirmed_by_reviewer" } : item,
    ),
    events: [...record.events, { type: "approved", actor: reviewer, at: when }],
  };
}

/** S-F01 식사 보태기 결과(시나리오 1, 5단계). */
export function withMealAddition(record: DemoRecord): DemoRecord {
  const addition = f01.after_worker_addition;
  return {
    ...record,
    transcript: record.transcript.includes(addition.spoken)
      ? record.transcript
      : `${record.transcript} ${addition.spoken}`.trim(),
    transcriptKo: record.transcriptKo.includes(addition.spoken)
      ? record.transcriptKo
      : `${record.transcriptKo} ${addition.spoken}`.trim(),
    items: record.items.map((item) => {
      const patch = addition.items.find((value) => value.item_key === item.item_key);
      if (!patch) return item;
      return {
        ...item,
        status: patch.status as ItemStatus,
        value_ko: patch.value_ko,
        value_native: patch.value_native,
        evidence: patch.evidence,
        reason: patch.reason,
        reason_native: "",
        source: "worker" as const,
        confirmed: true,
        resolution: null,
        ...("detail" in patch && patch.detail
          ? { detail: patch.detail as Record<string, unknown> }
          : {}),
      };
    }),
  };
}

export function createDemoDb(today: string = kstToday()): DemoDb {
  const startDate = addDays(today, -7);
  const residents: Resident[] = [
    {
      id: "kim",
      alias: "김○○ 어르신",
      initial: "김",
      careType: "facility",
      visitDays: null,
      visitTime: "07:00~16:00",
      caseId: "S-F01",
      startDate,
    },
    {
      id: "lee",
      alias: "이○○ 어르신",
      initial: "이",
      careType: "home",
      visitDays: [1, 2, 3, 4, 5],
      visitTime: "14:00~17:00",
      caseId: "S-H01",
      startDate,
    },
    {
      id: "park",
      alias: "박○○ 어르신",
      initial: "박",
      careType: "facility",
      visitDays: null,
      visitTime: "07:00~16:00",
      caseId: "S-F05",
      startDate,
    },
  ];
  const [kim, lee, park] = residents;
  const worker = "마이";
  const reviewer = "박 사회복지사";
  const records: DemoRecord[] = [];

  // 김○○(시설, S-F01): 어제 임시 저장, 3일 전 되돌아옴, 5일 전 보냄, 그 밖은 승인·빈 날
  records.push(filledRecord(kim, addDays(today, -1), "14:30", worker));
  records.push(
    seedApproved(
      seedSubmitted(filledRecord(kim, addDays(today, -2), "10:00", worker), "10:15", worker),
      reviewer,
    ),
  );
  const returned = seedSubmitted(
    withMealAddition(filledRecord(kim, addDays(today, -3), "16:00", worker)),
    "16:20",
    worker,
  );
  const returnedAt = at(addDays(today, -2), "09:10");
  records.push({
    ...returned,
    status: "returned",
    returnReason: "식사량을 ‘조금’이 아니라 ‘절반 정도’로 고쳤어요. 맞는지 확인해 주세요.",
    returnReasonNative: "Tôi đã sửa lượng ăn thành “khoảng một nửa”. Hãy kiểm tra lại.",
    returnedBy: reviewer,
    returnedAt,
    updatedAt: returnedAt,
    items: returned.items.map((item) =>
      item.item_key === "meal"
        ? {
            ...item,
            before_ko: item.value_ko,
            value_ko: "점심 죽 절반 정도 드심.",
            value_native: "Bữa trưa bà ăn khoảng một nửa bát cháo.",
            source: "reviewer" as const,
            confirmed: false,
          }
        : item.item_key === "discomfort"
          ? { ...item, resolution: "confirmed_by_reviewer" as const }
          : item,
    ),
    events: [
      ...returned.events,
      { type: "edited", actor: reviewer, at: returnedAt, item_key: "meal" },
      { type: "returned", actor: reviewer, at: returnedAt },
    ],
  });
  records.push(
    seedSubmitted(
      withMealAddition(filledRecord(kim, addDays(today, -5), "16:00", worker)),
      "16:20",
      worker,
    ),
  );
  records.push(
    seedApproved(
      seedSubmitted(filledRecord(kim, addDays(today, -7), "13:30", worker), "13:50", worker),
      reviewer,
    ),
  );

  // 이○○(재가, S-H01): 방문 요일 중 가장 가까운 지난 날은 보냄(제공시간 합 200분 > 방문 180분)
  const leeDays = [-1, -2, -3, -4, -5, -6, -7]
    .map((n) => addDays(today, n))
    .filter((date) => lee.visitDays?.includes(isoWeekday(date)));
  leeDays.forEach((date, index) => {
    if (index === 0) {
      const base = filledRecord(lee, date, "17:05", worker);
      const minutes = h01.worker_input.support_detail_minutes;
      const filled = {
        ...base,
        items: base.items.map((item) =>
          item.item_key === "support"
            ? {
                ...item,
                status: "needs_check" as const,
                ...minutesReason(200, 180),
                source: "worker" as const,
                confirmed: true,
                detail: { ...(item.detail ?? {}), minutes },
              }
            : item,
        ),
      };
      records.push(seedSubmitted(filled, "17:20", worker));
    } else if (index === 2) {
      // 비워 둠 → 못 쓴 기록
    } else {
      records.push(
        seedApproved(
          seedSubmitted(filledRecord(lee, date, "17:05", worker), "17:20", worker),
          reviewer,
        ),
      );
    }
  });

  // 박○○(시설, S-F05): 오늘 승인, 4일 전 빈 날
  for (const n of [0, -1, -2, -3, -5, -6, -7]) {
    const date = addDays(today, n);
    records.push(
      seedApproved(
        seedSubmitted(filledRecord(park, date, "09:40", worker), "10:00", worker),
        reviewer,
      ),
    );
  }

  return {
    version: 2,
    seededOn: today,
    worker: { name: worker, email: "worker@carebridge.test", org: "케어브릿지 데모 요양센터" },
    reviewer: { name: reviewer },
    onboarded: false,
    fontSize: "normal",
    residents,
    records: Object.fromEntries(records.map((record) => [record.id, record])),
    noCareDays: [],
  };
}

// ---------- 읽기 ----------

export function getResident(db: DemoDb, id: string) {
  return db.residents.find((resident) => resident.id === id);
}

/** 그날이 ‘기록이 있어야 하는 날’인지(데이터구조 v1.6.2 못 쓴 기록). */
export function isCareDay(db: DemoDb, resident: Resident, date: string): boolean {
  if (date < resident.startDate) return false;
  if (resident.visitDays && !resident.visitDays.includes(isoWeekday(date))) return false;
  return !db.noCareDays.some((day) => day.residentId === resident.id && day.careDate === date);
}

export function findRecord(db: DemoDb, residentId: string, careDate: string) {
  return db.records[recordId(residentId, careDate)];
}

export type MissedRecord = {
  residentId: string;
  careDate: string;
  kind: "missing" | "draft";
  recordId?: string;
};

/** list_missed_records와 같은 규칙: 지난 7일 빈 날 + 날짜 제한 없는 지난 임시 저장. 최신이 위. */
export function listMissed(db: DemoDb, today: string, days = 7): MissedRecord[] {
  const rows: MissedRecord[] = [];
  for (const resident of db.residents) {
    for (let n = 1; n <= days; n += 1) {
      const date = addDays(today, -n);
      if (!isCareDay(db, resident, date)) continue;
      if (!findRecord(db, resident.id, date)) {
        rows.push({ residentId: resident.id, careDate: date, kind: "missing" });
      }
    }
  }
  for (const record of Object.values(db.records)) {
    if (record.status === "draft" && record.careDate < today) {
      rows.push({
        residentId: record.residentId,
        careDate: record.careDate,
        kind: "draft",
        recordId: record.id,
      });
    }
  }
  return rows.sort((a, b) => (a.careDate === b.careDate ? 0 : a.careDate < b.careDate ? 1 : -1));
}

export type TodayCard = { resident: Resident; record?: DemoRecord };

export function todayCards(db: DemoDb, today: string): TodayCard[] {
  return db.residents
    .filter((resident) => isCareDay(db, resident, today))
    .map((resident) => ({ resident, record: findRecord(db, resident.id, today) }));
}

export function returnedRecords(db: DemoDb): DemoRecord[] {
  return Object.values(db.records)
    .filter((record) => record.status === "returned")
    .sort((a, b) => (a.careDate < b.careDate ? 1 : -1));
}

export function workerRecords(db: DemoDb): DemoRecord[] {
  return Object.values(db.records).sort((a, b) =>
    a.careDate === b.careDate
      ? a.residentId.localeCompare(b.residentId)
      : a.careDate < b.careDate
        ? 1
        : -1,
  );
}

/** 처음 보낸 한국 날짜가 돌봄 날짜보다 늦으면 n일(record_late_submit과 같은 계산). */
export function lateDays(record: DemoRecord): number | null {
  if (!record.firstSubmittedAt) return null;
  return Math.max(0, diffDays(kstDateOf(record.firstSubmittedAt), record.careDate));
}

/** W3 묶음: 확인 필요 → 아직 확인 안 함 → 끝남. 묶음 안은 displayOrder. */
export function groupItems(items: RecordItem[]) {
  const sorted = [...items].sort(
    (a, b) => displayOrder.indexOf(a.item_key) - displayOrder.indexOf(b.item_key),
  );
  const done = (item: RecordItem) => item.confirmed || item.source === "worker";
  return {
    needsCheck: sorted.filter((item) => item.status === "needs_check" && !done(item)),
    pending: sorted.filter((item) => item.status !== "needs_check" && !done(item)),
    done: sorted.filter(done),
  };
}

export function canSubmitRecord(record: DemoRecord): boolean {
  return (
    (record.status === "draft" || record.status === "returned") &&
    record.draftState === "ready" &&
    record.items.every(
      (item) => item.status === "needs_check" || item.confirmed || item.source === "worker",
    )
  );
}

export function canApproveRecord(record: DemoRecord): boolean {
  return record.status === "submitted" && countUnresolved(record.items) === 0;
}

// ---------- 바꾸기 (작성자) ----------

export type CreateError = "future" | "too_old" | "no_care_day";

/** 기록 만들기: 오늘~7일 전, 기록 없음 처리한 날 아님. 이미 있으면 그 기록을 연다. */
export function ensureRecord(
  db: DemoDb,
  residentId: string,
  careDate: string,
  today: string,
  now: string,
): { db: DemoDb; id: string } | { error: CreateError } {
  const existing = findRecord(db, residentId, careDate);
  if (existing) return { db, id: existing.id };
  const resident = getResident(db, residentId);
  if (!resident) return { error: "no_care_day" };
  if (careDate > today) return { error: "future" };
  if (careDate < addDays(today, -7)) return { error: "too_old" };
  if (db.noCareDays.some((day) => day.residentId === residentId && day.careDate === careDate)) {
    return { error: "no_care_day" };
  }
  const record = blankRecord(resident, careDate, now, db.worker.name);
  return { db: { ...db, records: { ...db.records, [record.id]: record } }, id: record.id };
}

export function updateRecord(
  db: DemoDb,
  id: string,
  change: (record: DemoRecord) => DemoRecord,
): DemoDb {
  const record = db.records[id];
  if (!record) return db;
  return { ...db, records: { ...db.records, [id]: change(record) } };
}

export function markProcessing(db: DemoDb, id: string, text: string | null, now: string): DemoDb {
  return updateRecord(db, id, (record) => ({
    ...record,
    draftState: "processing",
    inputMode: text === null ? "voice" : "text",
    transcript: text ?? record.transcript,
    transcriptKo: text ?? record.transcriptKo,
    updatedAt: now,
  }));
}

/** Mock 초안: 받아쓴 말이나 쓴 글과 상관없이 그 어르신 합성 사례의 초안을 넣는다(시연 전용). */
export function fillMockDraft(db: DemoDb, id: string, now: string): DemoDb {
  return updateRecord(db, id, (record) => {
    const resident = getResident(db, record.residentId);
    if (!resident) return record;
    const { transcript, transcriptKo } = caseTranscript(resident.caseId);
    return {
      ...record,
      draftState: "ready",
      transcript: record.transcript || transcript,
      transcriptKo: record.transcript ? record.transcriptKo : transcriptKo,
      // 작성자·담당자가 쓴 항목(source가 ai가 아님)은 AI가 덮어쓰지 않는다(AGENTS.md 원칙 4).
      items: caseItems(resident.caseId).map(
        (item) =>
          record.items.find((old) => old.item_key === item.item_key && old.source !== "ai") ?? item,
      ),
      updatedAt: now,
      events: [...record.events, { type: "ai_filled", actor: "AI", at: now }],
    };
  });
}

export function markDraftFailed(db: DemoDb, id: string, now: string): DemoDb {
  return updateRecord(db, id, (record) => ({ ...record, draftState: "failed", updatedAt: now }));
}

function editable(record: DemoRecord) {
  return record.status === "draft" || record.status === "returned";
}

export function confirmItem(db: DemoDb, id: string, key: ItemKey, now: string): DemoDb {
  return updateRecord(db, id, (record) =>
    editable(record)
      ? {
          ...record,
          updatedAt: now,
          items: record.items.map((item) =>
            item.item_key === key ? { ...item, confirmed: true } : item,
          ),
        }
      : record,
  );
}

export type WorkerEdit = { value_ko: string; detail?: Record<string, unknown> };

/** 제12호 지원별 분 키 6개(데이터구조 v1.6.2 support detail 칸 이름). */
export const supportMinuteKeys = [
  { key: "physical", ko: "신체활동지원 (합계)" },
  { key: "cognitive_stimulation", ko: "인지자극활동" },
  { key: "daily_living_together", ko: "일상생활 함께하기" },
  { key: "cognitive_management", ko: "인지관리지원" },
  { key: "emotional", ko: "정서지원" },
  { key: "housework", ko: "가사 및 일상생활지원 (합계)" },
] as const;

function minutesOf(time: unknown): number | null {
  if (typeof time !== "string" || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** 방문 시간(분). 시작·종료가 없으면 null. */
export function visitMinutes(record: DemoRecord): number | null {
  const detail = record.items.find((item) => item.item_key === "visit_time")?.detail;
  const start = minutesOf(detail?.start);
  const end = minutesOf(detail?.end);
  return start === null || end === null || end <= start ? null : end - start;
}

export function supportMinutesTotal(record: DemoRecord): number {
  const minutes = record.items.find((item) => item.item_key === "support")?.detail?.minutes;
  if (!minutes || typeof minutes !== "object") return 0;
  return Object.values(minutes as Record<string, unknown>).reduce<number>(
    (sum, value) => sum + (typeof value === "number" && value > 0 ? value : 0),
    0,
  );
}

/** 코드가 쓰는 이유는 한국어·모국어 문장을 함께 정해 둔다(확인필요이유병기 결정 2번). */
export function minutesReason(total: number, visit: number) {
  return {
    reason: `지원별 제공시간 합(${total}분)이 방문 시간(${visit}분)보다 김`,
    reason_native: `Tổng thời gian hỗ trợ (${total} phút) dài hơn thời gian thăm (${visit} phút).`,
  };
}

/** 기록 검증 검사 5(support_minutes_exceed_visit): 제12호 지원별 분 합이 방문 시간보다 길면 ‘확인 필요’. 코드가 맡는다. */
function checkSupportMinutes(record: DemoRecord): DemoRecord {
  if (record.formType !== "12") return record;
  const visit = visitMinutes(record);
  const total = supportMinutesTotal(record);
  return {
    ...record,
    items: record.items.map((item) => {
      if (item.item_key !== "support" || item.source !== "worker") return item;
      if (visit !== null && total > visit) {
        return {
          ...item,
          status: "needs_check" as const,
          ...minutesReason(total, visit),
        };
      }
      return item.status === "needs_check"
        ? {
            ...item,
            status: item.value_ko.trim() ? ("observed" as const) : ("not_mentioned" as const),
            reason: "",
            reason_native: "",
          }
        : item;
    }),
  };
}

/** 작성자가 고침: source=worker, confirmed=true. 되돌아온 기록이면 resolution을 비운다(되돌림재확인 결정). */
export function workerEditItem(
  db: DemoDb,
  id: string,
  key: ItemKey,
  edit: WorkerEdit,
  now: string,
): DemoDb {
  return updateRecord(db, id, (record) => {
    if (!editable(record)) return record;
    return checkSupportMinutes({
      ...record,
      updatedAt: now,
      items: record.items.map((item) =>
        item.item_key === key
          ? {
              ...item,
              value_ko: edit.value_ko,
              // 실제로는 서버가 한국어 기록체로 다시 쓰고 다시 번역한다. Mock은 번역을 비운다.
              value_native: "",
              status: edit.value_ko.trim() ? ("observed" as const) : ("not_mentioned" as const),
              reason: "",
              reason_native: "",
              detail: edit.detail ?? item.detail,
              source: "worker" as const,
              confirmed: true,
              resolution: record.status === "returned" ? null : item.resolution,
            }
          : item,
      ),
      events: [...record.events, { type: "edited", actor: db.worker.name, at: now, item_key: key }],
    });
  });
}

/** 제12호 배변 실수 횟수 2칸(form_fields.stool_accidents, urine_accidents). */
export function setFormField(
  db: DemoDb,
  id: string,
  key: "stool_accidents" | "urine_accidents",
  value: number | null,
  now: string,
): DemoDb {
  return updateRecord(db, id, (record) =>
    editable(record)
      ? { ...record, updatedAt: now, formFields: { ...record.formFields, [key]: value } }
      : record,
  );
}

/** 말로 보태기 Mock: S-F01 식사만 사례 답이 있다. 없으면 null. */
export function mockVoiceAddition(
  db: DemoDb,
  id: string,
  key: ItemKey,
  now: string,
): DemoDb | null {
  const record = db.records[id];
  const resident = record && getResident(db, record.residentId);
  if (!record || !resident || resident.caseId !== "S-F01" || key !== "meal" || !editable(record)) {
    return null;
  }
  const next = withMealAddition(record);
  return updateRecord(db, id, () => ({
    ...next,
    updatedAt: now,
    items: next.items.map((item) =>
      item.item_key === key && record.status === "returned" ? { ...item, resolution: null } : item,
    ),
    events: [...record.events, { type: "edited", actor: db.worker.name, at: now, item_key: key }],
  }));
}

export function submitRecord(db: DemoDb, id: string, now: string): DemoDb {
  return updateRecord(db, id, (record) =>
    canSubmitRecord(record)
      ? {
          ...record,
          status: "submitted",
          firstSubmittedAt: record.firstSubmittedAt ?? now,
          submittedAt: now,
          updatedAt: now,
          events: [...record.events, { type: "submitted", actor: db.worker.name, at: now }],
        }
      : record,
  );
}

export function addNoCareDay(
  db: DemoDb,
  day: Omit<NoCareDay, "createdBy">,
  today: string,
): DemoDb | { error: "has_record" | "too_old" | "note_required" } {
  if (findRecord(db, day.residentId, day.careDate)) return { error: "has_record" };
  if (day.careDate < addDays(today, -7) || day.careDate > today) return { error: "too_old" };
  if (day.reason === "other" && !day.note.trim()) return { error: "note_required" };
  return { ...db, noCareDays: [...db.noCareDays, { ...day, createdBy: db.worker.name }] };
}
