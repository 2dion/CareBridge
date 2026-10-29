import fixture from "./s-f01.json";

export type Screen =
  | "today"
  | "record"
  | "draft"
  | "archive"
  | "helper"
  | "profile"
  | "pending"
  | "review"
  | "approved";
export type Role = "worker" | "reviewer";
export type ItemKey =
  | "visit_time"
  | "support"
  | "meal"
  | "sleep"
  | "discomfort"
  | "medication"
  | "cognition"
  | "notes"
  | "next_check";
export type ItemStatus = "observed" | "not_mentioned" | "needs_check";
export type Resolution = "confirmed_by_reviewer" | "omitted" | null;
export type RecordStatus = "draft" | "submitted" | "returned" | "approved";

export type Item = {
  item_key: ItemKey;
  status: ItemStatus;
  value_ko: string;
  value_native: string;
  evidence: string;
  reason: string;
  /** reason의 모국어 번역(데이터구조 v1.6.2, 확인필요이유병기 결정). */
  reason_native?: string;
  confirmed_by_worker: boolean;
  source: "ai" | "worker" | "reviewer";
  resolution: Resolution;
  detail?: Record<string, unknown>;
};
export type Event = { action: string; actor: string; at: string; detail?: string };
export type DemoState = {
  status: RecordStatus;
  transcript: string;
  transcript_ko: string;
  items: Item[];
  events: Event[];
  returnReason: string;
  submittedAt: string | null;
  approvedAt: string | null;
  recordingText: string;
  draftPrepared: boolean;
  revision: number;
};

export const caseData = fixture;
export const itemOrder: { key: ItemKey; ko: string; vi: string }[] = [
  { key: "visit_time", ko: "방문 시점", vi: "Thời gian chăm sóc" },
  { key: "support", ko: "제공 지원", vi: "Hỗ trợ đã thực hiện" },
  { key: "meal", ko: "식사", vi: "Bữa ăn" },
  { key: "sleep", ko: "수면", vi: "Giấc ngủ" },
  { key: "discomfort", ko: "불편감 표현", vi: "Biểu hiện khó chịu" },
  { key: "medication", ko: "복약 관찰", vi: "Quan sát dùng thuốc" },
  { key: "cognition", ko: "인지 변화", vi: "Thay đổi nhận thức" },
  { key: "notes", ko: "특이사항", vi: "Ghi chú đặc biệt" },
  { key: "next_check", ko: "다음 확인사항", vi: "Điều cần kiểm tra tiếp" },
];
export const statusLabel: Record<RecordStatus, string> = {
  draft: "임시 저장",
  submitted: "전송 완료",
  returned: "수정 필요",
  approved: "승인 완료",
};
export const itemStatusLabel: Record<ItemStatus, string> = {
  observed: "관찰",
  not_mentioned: "언급 없음",
  needs_check: "확인 필요",
};
export const statusVi: Record<RecordStatus, string> = {
  draft: "Đã lưu tạm",
  submitted: "Đã gửi",
  returned: "Cần sửa",
  approved: "Đã duyệt",
};
export const STORAGE_KEY = "carebridge-sf01-mock-v1";

export function createDemoState(): DemoState {
  return {
    status: "draft",
    transcript: fixture.transcript,
    transcript_ko: fixture.transcript_ko,
    items: fixture.draft.items.map((value) => ({
      item_key: value.item_key as ItemKey,
      status: value.status as ItemStatus,
      value_ko: value.value_ko,
      value_native: value.value_native,
      evidence: value.evidence,
      reason: value.reason,
      confirmed_by_worker: false,
      resolution: null,
      source: "ai" as const,
      ...("detail" in value && typeof value.detail === "object"
        ? { detail: value.detail as Record<string, unknown> }
        : {}),
    })),
    events: [
      {
        action: "created",
        actor: "마이",
        at: "2026-10-22T16:00:00+09:00",
        detail: "합성 사례 S-F01",
      },
    ],
    returnReason: "",
    submittedAt: null,
    approvedAt: null,
    recordingText: fixture.transcript,
    draftPrepared: false,
    revision: 0,
  };
}

export function countUnresolved(items: Item[]): number {
  return items.filter((item) => item.status === "needs_check" && !item.resolution).length;
}
export function canSubmit(items: Item[]): boolean {
  // 기획안: 확인 필요는 미해결로 제출할 수 있다. 그 밖의 항목은 작성자가 확인해야 한다.
  return items.every(
    (item) => item.status === "needs_check" || item.confirmed_by_worker || item.source === "worker",
  );
}
export function canApprove(state: DemoState): boolean {
  return state.status === "submitted" && countUnresolved(state.items) === 0;
}
export function applyMealAddition(state: DemoState): DemoState {
  const updates = fixture.after_worker_addition.items;
  const items = state.items.map((item) => {
    const patch = updates.find((data) => data.item_key === item.item_key);
    if (!patch) return item;
    return {
      ...item,
      status: patch.status as ItemStatus,
      value_ko: patch.value_ko,
      value_native: patch.value_native,
      evidence: patch.evidence,
      reason: patch.reason,
      confirmed_by_worker: item.item_key === "meal",
      source: "worker" as const,
      resolution: null,
      ...("detail" in patch && patch.detail
        ? { detail: patch.detail as Record<string, unknown> }
        : {}),
    };
  });
  return {
    ...state,
    items,
    transcript: state.transcript.includes(fixture.after_worker_addition.spoken)
      ? state.transcript
      : `${state.transcript} ${fixture.after_worker_addition.spoken}`,
    transcript_ko: state.transcript_ko.includes(fixture.after_worker_addition.spoken)
      ? state.transcript_ko
      : `${state.transcript_ko} ${fixture.after_worker_addition.spoken}`,
    revision: state.revision + 1,
  };
}
export const demoAgentSteps = [
  {
    tool: "get_form_spec",
    name: "서식 기준 조회",
    reason: "시설급여의 별지 제16호 기록 칸을 확인하기 위해",
    result: "별지 제16호 · 검증됨",
  },
  {
    tool: "search_glossary",
    name: "용어 검색",
    reason: "‘조금’의 섭취량 기준을 확인하기 위해",
    result: "정확한 수치 없음 → 확인 필요",
  },
  {
    tool: "validate_draft",
    name: "기록 검증",
    reason: "원문 근거와 9개 항목을 검사하기 위해",
    result: "모호한 표현은 확인 필요로 표시",
  },
  {
    tool: "return_draft",
    name: "초안 반환",
    reason: "작성자가 검토할 초안을 전달하기 위해",
    result: "9개 항목 초안 준비",
  },
];
export function koreanDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);
}
