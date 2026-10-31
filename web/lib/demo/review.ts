// 관리자 화면(M1~M5) Mock 규칙. 승인 조건·되돌림·덮어쓰기 금지는 코드가 맡는다(AGENTS.md 원칙 3·5).
// 실제로는 PATCH /api/records/:id/items/:key, POST /approve, POST /return(데이터구조 v1.6.2 공통 계약).
import { demoAgentSteps, type ItemKey, type Resolution } from "./state";
import {
  addDays,
  canApproveRecord,
  type DemoDb,
  type DemoRecord,
  displayOrder,
  findRecord,
  type NoCareDay,
  OVERDUE_FROM,
  OVERDUE_TO,
  type Resident,
  updateRecord,
} from "./store";

/** M1: 전송한 기록, 받은 시각이 오래된 순. 시각이 없으면 마지막(#148). */
export function reviewQueue(db: DemoDb): DemoRecord[] {
  return Object.values(db.records)
    .filter((record) => record.status === "submitted")
    .sort(
      (a, b) =>
        (a.submittedAt ?? "9999").localeCompare(b.submittedAt ?? "9999") ||
        a.id.localeCompare(b.id),
    );
}

/** M1 '재전송' 표시: 한 번이라도 되돌린 뒤 다시 전송한 기록(record_events의 returned로 계산). */
export function wasResent(record: DemoRecord): boolean {
  return record.status === "submitted" && record.events.some((event) => event.type === "returned");
}

export function approvedRecords(db: DemoDb): DemoRecord[] {
  return Object.values(db.records)
    .filter((record) => record.status === "approved")
    .sort((a, b) => (a.careDate === b.careDate ? 0 : a.careDate < b.careDate ? 1 : -1));
}

/** M2 묶음: 정하지 않은 확인 필요 → 고친 항목 → 관찰 → 언급 없음. 묶음 안은 기본 순서.
 *  화면은 연 때 한 번만 계산하고(이슈 #140, 처리하면 카드가 움직여 누르려던 자리가 밀림), 그 뒤는 frozenOrder로 그 순서를 지킨다. */
export function reviewOrder(record: DemoRecord) {
  const rank = (item: DemoRecord["items"][number]) => {
    if (item.status === "needs_check" && item.resolution === null) return 0;
    if (item.source !== "ai") return 1;
    if (item.status === "observed" || item.status === "needs_check") return 2;
    return 3;
  };
  return [...record.items].sort(
    (a, b) =>
      rank(a) - rank(b) || displayOrder.indexOf(a.item_key) - displayOrder.indexOf(b.item_key),
  );
}

/** 화면을 연 때의 순서(keys)대로 지금 항목을 늘어놓는다. 그 뒤 생긴 항목은 뒤에 붙인다(이슈 #140). */
export function frozenOrder(record: DemoRecord, keys: ItemKey[]) {
  const byKey = new Map(record.items.map((item) => [item.item_key, item]));
  const known = keys.flatMap((key) => byKey.get(key) ?? []);
  const rest = reviewOrder(record).filter((item) => !keys.includes(item.item_key));
  return [...known, ...rest];
}

const byDisplayOrder = (a: ItemKey, b: ItemKey) =>
  displayOrder.indexOf(a) - displayOrder.indexOf(b);

/** 요약 띠: 누가 어느 항목을 고쳤는지. record_events의 edited 줄(누가)로 세고, [확인함]·[기록 안 함](resolved)은 수정으로 세지 않는다.
 *  record_items.source는 관리자가 손대면 DB가 reviewer로 바꿔 작성자 수정이 사라지므로 쓰지 않는다(이슈 #124). */
export function sourceSummary(record: DemoRecord) {
  const by = (role: "worker" | "reviewer") =>
    [
      ...new Set(
        record.events
          .filter((event) => event.type === "edited" && event.actor_role === role && event.item_key)
          .map((event) => event.item_key as ItemKey),
      ),
    ].sort(byDisplayOrder);
  const worker = by("worker");
  const reviewer = by("reviewer");
  const touched = new Set<ItemKey>([...worker, ...reviewer]);
  return {
    worker,
    reviewer,
    aiCount: record.items.filter((item) => !touched.has(item.item_key)).length,
  };
}

export type HistoryStep = {
  kind: "created" | "submitted" | "resubmitted" | "returned" | "reviewed" | "approved";
  actor: string;
  at: string;
  /** returned: 되돌림 사유 */
  reason?: string;
  /** reviewed: 관리자가 고친 항목. resubmitted: 되돌린 뒤 작성자가 고친 항목 */
  edited: ItemKey[];
  /** reviewed: [확인함]·[기록 안 함]을 고른 항목(다시 정한 것은 뺌) */
  resolved: { item_key: ItemKey; resolution: Exclude<Resolution, null> }[];
};

/** M3 처리 이력: record_events를 순서대로 작성 → 전송 → (검토·수정 → 되돌림 → 재전송)… → 검토·수정 → 승인으로 묶는다.
 *  되돌림은 사유를, 재전송은 작성자가 고친 항목을, 검토·수정은 관리자 수정과 확인 처리를 함께 보인다(이슈 #124). */
export function processHistory(record: DemoRecord): HistoryStep[] {
  const steps: HistoryStep[] = [];
  let submits = 0;
  let review: HistoryStep | null = null;
  let workerEdits: ItemKey[] = [];
  const flushReview = () => {
    if (review) steps.push(review);
    review = null;
  };
  const openReview = (event: DemoRecord["events"][number]): HistoryStep => {
    review ??= { kind: "reviewed", actor: event.actor, at: event.at, edited: [], resolved: [] };
    review.actor = event.actor;
    review.at = event.at;
    return review;
  };
  for (const event of record.events) {
    switch (event.type) {
      case "created":
        steps.push({ kind: "created", actor: event.actor, at: event.at, edited: [], resolved: [] });
        break;
      case "submitted":
        submits += 1;
        steps.push({
          kind: submits === 1 ? "submitted" : "resubmitted",
          actor: event.actor,
          at: event.at,
          edited: [...new Set(workerEdits)].sort(byDisplayOrder),
          resolved: [],
        });
        workerEdits = [];
        break;
      case "returned":
        flushReview();
        steps.push({
          kind: "returned",
          actor: event.actor,
          at: event.at,
          ...(event.note ? { reason: event.note } : {}),
          edited: [],
          resolved: [],
        });
        break;
      case "approved":
        // 수정·확인 처리가 없어도 ‘검토·수정 · 수정 없음’ 단계는 둔다(화면 v1.3 M3 4단계)
        review ??= { kind: "reviewed", actor: event.actor, at: event.at, edited: [], resolved: [] };
        flushReview();
        steps.push({
          kind: "approved",
          actor: event.actor,
          at: event.at,
          edited: [],
          resolved: [],
        });
        break;
      case "edited":
        if (!event.item_key) break;
        if (event.actor_role === "reviewer") {
          const step = openReview(event);
          if (!step.edited.includes(event.item_key)) step.edited.push(event.item_key);
          step.edited.sort(byDisplayOrder);
        } else if (event.actor_role === "worker") {
          workerEdits.push(event.item_key);
        }
        break;
      case "resolved": {
        if (!event.item_key || event.actor_role !== "reviewer") break;
        const step = openReview(event);
        const key = event.item_key;
        step.resolved = step.resolved.filter((entry) => entry.item_key !== key);
        if (event.note === "confirmed_by_reviewer" || event.note === "omitted") {
          step.resolved.push({ item_key: key, resolution: event.note });
          step.resolved.sort((a, b) => byDisplayOrder(a.item_key, b.item_key));
        }
        break;
      }
      default:
        break;
    }
  }
  flushReview();
  return steps;
}

function reviewable(record: DemoRecord) {
  return record.status === "submitted";
}

/** 관리자 직접 수정: source=reviewer, 고치기 전 내용을 남김. 작성자 확인은 풀린다(되돌아오면 다시 [확인 완료]). */
export function reviewerEditItem(
  db: DemoDb,
  id: string,
  key: ItemKey,
  value: string,
  now: string,
): DemoDb {
  return updateRecord(db, id, (record) => {
    if (!reviewable(record)) return record;
    return {
      ...record,
      updatedAt: now,
      items: record.items.map((item) =>
        item.item_key === key && item.value_ko !== value
          ? {
              ...item,
              before_ko: item.before_ko ?? item.value_ko,
              value_ko: value,
              // 실제로는 서버가 다시 번역한다. Mock은 번역을 비운다.
              value_native: "",
              status:
                item.status === "needs_check"
                  ? item.status
                  : value.trim()
                    ? ("observed" as const)
                    : ("not_mentioned" as const),
              source: "reviewer" as const,
              confirmed_by_worker: false,
            }
          : item,
      ),
      events: [
        ...record.events,
        { type: "edited", actor: db.reviewer.name, actor_role: "reviewer", at: now, item_key: key },
      ],
    };
  });
}

/** [확인함] / [기록 안 함]. 기록 안 함은 내용을 비우고 사유를 남긴다. null이면 다시 정하기. */
export function resolveItem(
  db: DemoDb,
  id: string,
  key: ItemKey,
  resolution: "confirmed_by_reviewer" | "omitted" | null,
  note: string,
  now: string,
): DemoDb | { error: "note_required" } {
  if (resolution === "omitted" && !note.trim()) return { error: "note_required" };
  return updateRecord(db, id, (record) => {
    if (!reviewable(record)) return record;
    return {
      ...record,
      updatedAt: now,
      items: record.items.map((item) => {
        if (item.item_key !== key || item.status !== "needs_check") return item;
        if (resolution === null) {
          return {
            ...item,
            resolution: null,
            resolution_note: undefined,
            resolved_by: undefined,
            resolved_at: undefined,
          };
        }
        return {
          ...item,
          resolution,
          resolution_note: resolution === "omitted" ? note.trim() : undefined,
          resolved_by: db.reviewer.name,
          resolved_at: now,
          ...(resolution === "omitted"
            ? { before_ko: item.before_ko ?? item.value_ko, value_ko: "", value_native: "" }
            : {}),
        };
      }),
      events: [
        ...record.events,
        {
          type: "resolved",
          actor: db.reviewer.name,
          actor_role: "reviewer",
          at: now,
          item_key: key,
          note: resolution ?? "reopened",
        },
      ],
    };
  });
}

export function approveRecord(
  db: DemoDb,
  id: string,
  now: string,
): DemoDb | { error: "unresolved" } {
  const record = db.records[id];
  // 화면에서 막아도 여기서 다시 검사한다(서버 재검사와 같은 자리).
  if (!record || !canApproveRecord(record)) return { error: "unresolved" };
  return updateRecord(db, id, (current) => ({
    ...current,
    status: "approved",
    approvedAt: now,
    approvedBy: db.reviewer.name,
    updatedAt: now,
    events: [
      ...current.events,
      { type: "approved", actor: db.reviewer.name, actor_role: "reviewer", at: now },
    ],
  }));
}

export function returnRecord(
  db: DemoDb,
  id: string,
  reason: string,
  now: string,
): DemoDb | { error: "reason_required" } {
  if (!reason.trim()) return { error: "reason_required" };
  return updateRecord(db, id, (record) =>
    reviewable(record)
      ? {
          ...record,
          status: "returned",
          returnReason: reason.trim(),
          // 실제로는 서버가 작성자 모국어로 번역(return_reason_native). Mock은 비운다.
          returnReasonNative: "",
          returnedBy: db.reviewer.name,
          returnedAt: now,
          updatedAt: now,
          events: [
            ...record.events,
            {
              type: "returned",
              actor: db.reviewer.name,
              actor_role: "reviewer",
              at: now,
              note: reason.trim(),
            },
          ],
        }
      : record,
  );
}

/** M1 기한 지난 빈 기록 → [기록 없음으로 정리]. 관리자만, 8~30일 전 날짜만(기한지난빈기록 결정). */
export function markOverdueNoCare(
  db: DemoDb,
  day: Omit<NoCareDay, "createdBy">,
  today: string,
): DemoDb | { error: "has_record" | "out_of_range" | "note_required" } {
  if (findRecord(db, day.residentId, day.careDate)) return { error: "has_record" };
  if (day.careDate > addDays(today, -OVERDUE_FROM) || day.careDate < addDays(today, -OVERDUE_TO)) {
    return { error: "out_of_range" };
  }
  if (day.reason === "other" && !day.note.trim()) return { error: "note_required" };
  return { ...db, noCareDays: [...db.noCareDays, { ...day, createdBy: db.reviewer.name }] };
}

export function removeNoCareDay(db: DemoDb, residentId: string, careDate: string): DemoDb {
  return {
    ...db,
    noCareDays: db.noCareDays.filter(
      (day) => !(day.residentId === residentId && day.careDate === careDate),
    ),
  };
}

/** M4 [수정]: 담당 연결(방문 요일·표시용 방문 시간·담당 시작일)과 어르신 정보(실명·급여 종류, 이슈 #96).
 *  name·careType·workerIds는 바뀐 때만 넣는다. 실제 모드의 workerIds는 담당 작성자 id 목록(이슈 #95) */
export type ResidentEdit = Pick<Resident, "visitDays" | "visitTime" | "startDate"> & {
  name?: string;
  careType?: Resident["careType"];
  workerIds?: string[];
};

/** 기록이 하나라도 있는 어르신은 급여 종류(서식)를 바꿀 수 없다(이슈 #96) */
export function residentHasRecords(db: DemoDb, residentId: string): boolean {
  return Object.values(db.records).some((record) => record.residentId === residentId);
}

export function updateResident(
  db: DemoDb,
  residentId: string,
  edit: ResidentEdit,
): DemoDb | { error: "name_required" | "care_type_locked" } {
  const { workerIds: _workerIds, ...fields } = edit;
  void _workerIds; // Mock은 작성자가 한 명이라 담당 연결 줄을 따로 두지 않는다
  if (fields.name !== undefined && (!fields.name.trim() || fields.name.trim().length > 80)) {
    return { error: "name_required" };
  }
  const current = db.residents.find((resident) => resident.id === residentId);
  if (
    fields.careType !== undefined &&
    current &&
    fields.careType !== current.careType &&
    residentHasRecords(db, residentId)
  ) {
    return { error: "care_type_locked" };
  }
  return {
    ...db,
    residents: db.residents.map((resident) =>
      resident.id === residentId
        ? {
            ...resident,
            ...fields,
            ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
            ...(fields.name !== undefined ? { initial: [...fields.name.trim()][0] ?? "" } : {}),
          }
        : resident,
    ),
  };
}

/** 바뀐 칸이 하나라도 있는지. 없으면 '저장했어요'를 띄우지 않는다(이슈 #96) */
export function residentEditChanged(
  resident: Resident,
  currentWorkerIds: string[] | null,
  edit: ResidentEdit,
): boolean {
  const sameDays =
    JSON.stringify(resident.visitDays ? [...resident.visitDays].sort() : null) ===
    JSON.stringify(edit.visitDays ? [...edit.visitDays].sort() : null);
  const sameWorkers =
    edit.workerIds === undefined ||
    currentWorkerIds === null ||
    JSON.stringify([...currentWorkerIds].sort()) === JSON.stringify([...edit.workerIds].sort());
  return !(
    sameDays &&
    sameWorkers &&
    (resident.visitTime ?? null) === (edit.visitTime ?? null) &&
    resident.startDate === edit.startDate &&
    (edit.name === undefined || edit.name === resident.name) &&
    (edit.careType === undefined || edit.careType === resident.careType)
  );
}

/** 공식 기록지 칸 안내(데이터구조 v1.6.2 '서식 칸 대응' 표). */
export const formFieldHint: Record<"16" | "12", Record<ItemKey, string>> = {
  "16": {
    visit_time: "별지 제16호 · 맺음(입·퇴소·외박·외출 시간)",
    support: "별지 제16호 · 신체활동지원, 인지관리 및 의사소통 체크",
    meal: "별지 제16호 · 신체활동지원 (식사 종류·섭취량)",
    sleep: "별지 제16호 · 신체활동지원 특이사항",
    discomfort: "별지 제16호 · 신체활동지원 특이사항",
    cognition: "별지 제16호 · 인지관리 및 의사소통 특이사항",
    medication: "별지 제16호 · 신체활동지원 특이사항 (직접 관찰한 내용)",
    notes: "별지 제16호 · 영역별 특이사항",
    next_check: "서식 칸 없음 · 기관 내부 메모",
  },
  "12": {
    visit_time: "별지 제12호 · 일정관리 시작·종료시간, 총시간(분)",
    support: "별지 제12호 · 지원별 체크와 제공시간(분)",
    meal: "별지 제12호 · 식사 도움, 변화상태 > 식사기능",
    sleep: "별지 제12호 · 특이사항",
    discomfort: "별지 제12호 · 변화상태 > 신체기능, 특이사항",
    cognition: "별지 제12호 · 변화상태 > 인지기능",
    medication: "별지 제12호 · 특이사항",
    notes: "별지 제12호 · 특이사항",
    next_check: "서식 칸 없음 · 기관 내부 메모",
  },
};

/** M4 어르신 추가: 실명·선택 사진(이슈 #99). 시연 초안은 같은 급여의 합성 사례를 쓴다. */
export function addResident(
  db: DemoDb,
  input: { name: string; careType: Resident["careType"]; startDate: string },
): DemoDb | { error: "name_required" } {
  const name = input.name.trim();
  if (!name || name.length > 80) return { error: "name_required" };
  const initial = [...name][0];
  const resident: Resident = {
    id: `r${db.residents.length + 1}-${Date.now().toString(36)}`,
    name,
    initial,
    careType: input.careType,
    visitDays: input.careType === "home" ? [] : null,
    visitTime: null,
    caseId: input.careType === "home" ? "S-H01" : "S-F05",
    startDate: input.startDate,
  };
  return { ...db, residents: [...db.residents, resident] };
}

/** M2 ‘AI 작업 기록’ Mock(실제로는 agent_steps 표). 서식에 맞춰 문구만 바꾼다. */
/**
 * M2 'AI 작업 기록' 접힘 제목. 도구를 쓴 기록이 없으면 빈 괄호 대신 '없음'(이슈 #179).
 * loaded가 false면(실제 모드에서 아직 읽는 중) 개수를 말하지 않는다.
 */
export function aiLogSummary(steps: { name: string }[], loaded: boolean): string {
  if (!loaded) return "AI 작업 기록 · 불러오는 중";
  if (steps.length === 0) return "AI 작업 기록 없음";
  return `AI 작업 기록 · 도구 ${steps.length}번 사용 (${steps.map((step) => step.name).join(" → ")})`;
}

export function mockAgentSteps(record: DemoRecord) {
  if (record.formType === "16") return demoAgentSteps;
  return demoAgentSteps.map((step) =>
    step.tool === "get_form_spec"
      ? {
          ...step,
          reason: "재가 방문요양의 별지 제12호 기록 칸을 확인하기 위해",
          result: "별지 제12호 · 검증됨",
        }
      : step.tool === "search_glossary"
        ? { ...step, reason: "말한 표현을 교재 용어로 맞추기 위해", result: "목욕 → 몸 씻기 도움" }
        : step,
  );
}
