// 담당자 화면(R1~R4) Mock 규칙. 승인 조건·되돌림·덮어쓰기 금지는 코드가 맡는다(AGENTS.md 원칙 3·5).
// 실제로는 PATCH /api/records/:id/items/:key, POST /approve, POST /return(데이터구조 v1.6.2 공통 계약).
import { countUnresolved, demoAgentSteps, type ItemKey } from "./state";
import {
  canApproveRecord,
  type DemoDb,
  type DemoRecord,
  displayOrder,
  type Resident,
  updateRecord,
} from "./store";

/** R1: 보낸 기록, 확인 필요가 많은 순 → 받은 시각 이른 순. */
export function reviewQueue(db: DemoDb): DemoRecord[] {
  return Object.values(db.records)
    .filter((record) => record.status === "submitted")
    .sort((a, b) => {
      const diff = countUnresolved(b.items) - countUnresolved(a.items);
      if (diff !== 0) return diff;
      return (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
    });
}

/** R1 '다시 보냄' 아이콘: 한 번이라도 되돌린 뒤 다시 보낸 기록(record_events의 returned로 계산). */
export function wasResent(record: DemoRecord): boolean {
  return record.status === "submitted" && record.events.some((event) => event.type === "returned");
}

export function approvedRecords(db: DemoDb): DemoRecord[] {
  return Object.values(db.records)
    .filter((record) => record.status === "approved")
    .sort((a, b) => (a.careDate === b.careDate ? 0 : a.careDate < b.careDate ? 1 : -1));
}

/** R2 묶음: 정하지 않은 확인 필요 → 고친 항목 → 관찰 → 언급 없음. 묶음 안은 기본 순서. */
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

/** 요약 띠: 누가 어느 항목을 바꿨는지(source). */
export function sourceSummary(record: DemoRecord) {
  const by = (source: "ai" | "worker" | "reviewer") =>
    record.items.filter((item) => item.source === source).map((item) => item.item_key);
  return { worker: by("worker"), reviewer: by("reviewer"), aiCount: by("ai").length };
}

function reviewable(record: DemoRecord) {
  return record.status === "submitted";
}

/** 담당자 직접 수정: source=reviewer, 고치기 전 내용을 남김. 작성자 확인은 풀린다(되돌아오면 다시 [맞아요]). */
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
              confirmed: false,
            }
          : item,
      ),
      events: [
        ...record.events,
        { type: "edited", actor: db.reviewer.name, at: now, item_key: key },
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
    events: [...current.events, { type: "approved", actor: db.reviewer.name, at: now }],
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
            { type: "returned", actor: db.reviewer.name, at: now, note: reason.trim() },
          ],
        }
      : record,
  );
}

export function removeNoCareDay(db: DemoDb, residentId: string, careDate: string): DemoDb {
  return {
    ...db,
    noCareDays: db.noCareDays.filter(
      (day) => !(day.residentId === residentId && day.careDate === careDate),
    ),
  };
}

export type ResidentEdit = Pick<Resident, "visitDays" | "visitTime" | "startDate">;

export function updateResident(db: DemoDb, residentId: string, edit: ResidentEdit): DemoDb {
  return {
    ...db,
    residents: db.residents.map((resident) =>
      resident.id === residentId ? { ...resident, ...edit } : resident,
    ),
  };
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
    medication: "별지 제16호 · 신체활동지원 특이사항 (요양보호사가 관찰한 내용)",
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

/** R4 어르신 추가: 실명 대신 성 한 글자 + ○○(원칙 9). 시연 초안은 같은 급여의 합성 사례를 쓴다. */
export function addResident(
  db: DemoDb,
  input: { initial: string; careType: Resident["careType"]; startDate: string },
): DemoDb | { error: "initial_required" | "duplicate" } {
  const initial = input.initial.trim().slice(0, 1);
  if (!initial) return { error: "initial_required" };
  const alias = `${initial}○○ 어르신`;
  if (db.residents.some((resident) => resident.alias === alias)) return { error: "duplicate" };
  const resident: Resident = {
    id: `r${db.residents.length + 1}-${Date.now().toString(36)}`,
    alias,
    initial,
    careType: input.careType,
    visitDays: input.careType === "home" ? [] : null,
    visitTime: null,
    caseId: input.careType === "home" ? "S-H01" : "S-F05",
    startDate: input.startDate,
  };
  return { ...db, residents: [...db.residents, resident] };
}

/** R2 ‘AI 작업 기록’ Mock(실제로는 agent_steps 표). 서식에 맞춰 문구만 바꾼다. */
export function mockAgentSteps(record: DemoRecord) {
  if (record.formType === "16") return demoAgentSteps;
  return demoAgentSteps.map((step) =>
    step.tool === "get_form_spec"
      ? {
          ...step,
          reason: "재가 방문요양의 별지 제12호 기록 칸을 확인하기 위해",
          result: "별지 제12호 · 검증됨",
        }
      : step.tool === "search_terms"
        ? { ...step, reason: "말한 표현을 교재 용어로 맞추기 위해", result: "목욕 → 몸 씻기 도움" }
        : step,
  );
}
