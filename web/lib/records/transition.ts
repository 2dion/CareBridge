// 기록 상태 바꾸기: 보내기(submit)·승인(approve)·되돌리기(return).
// 근거: 문서/설계/데이터구조-v1.6.4.md '공통 계약'(submit 조건·approve 조건·되돌림), '승인 서버 검사'
// DB 트리거도 같은 조건을 막지만, API가 먼저 검사해 이유를 돌려준다(supabase/README.md '서버 코드가 알아야 할 것').
// DB 호출은 TransitionDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

import type { Role } from "@/lib/auth/signup";

export type RecordStatus = "draft" | "submitted" | "returned" | "approved";

export type RecordRow = { id: string; status: RecordStatus; worker_id: string };

export type ItemRow = {
  item_key: string;
  status: "observed" | "not_mentioned" | "needs_check";
  source: "ai" | "worker" | "reviewer";
  confirmed_by_worker: boolean;
  resolution: "confirmed_by_reviewer" | "omitted" | null;
};

export type UpdateResult =
  { ok: true; row: Record<string, unknown> } | { ok: false; error: string };

export type TransitionDeps = {
  /** 로그인한 사람 id와 role. 로그인하지 않았으면 null */
  currentUser(): Promise<{ id: string; role: Role } | null>;
  /** 로그인한 사람 권한(RLS)으로 읽음. 볼 수 없으면 null */
  findRecord(recordId: string): Promise<RecordRow | null>;
  listItems(recordId: string): Promise<ItemRow[]>;
  /** 상태가 아직 from일 때만 바꾸고, 바뀐 행의 columns를 돌려줌. 0행이면 error = "no_rows" */
  update(
    recordId: string,
    from: RecordStatus,
    patch: Record<string, unknown>,
    columns: string,
  ): Promise<UpdateResult>;
};

export type ApiResult = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ApiResult => ({
  status,
  body: { error, ...extra },
});

// DB 트리거 오류 키 → 응답 코드 (supabase/README.md 오류 키 표)
const DB_ERRORS: Record<string, number> = {
  unresolved_needs_check: 409,
  unconfirmed_items: 409,
  invalid_transition: 409,
  record_locked: 409,
  return_reason_required: 400,
  reviewer_only: 403,
  not_record_worker: 403,
};

function fromUpdateError(error: string): ApiResult {
  if (error === "no_rows") return fail(409, "invalid_transition");
  const status = DB_ERRORS[error];
  return status ? fail(status, error) : fail(500, "update_failed");
}

type Loaded =
  { ok: true; userId: string; role: Role; record: RecordRow } | { ok: false; result: ApiResult };

async function load(recordId: string, deps: TransitionDeps): Promise<Loaded> {
  const user = await deps.currentUser();
  if (!user) return { ok: false, result: fail(401, "not_signed_in") };
  const record = await deps.findRecord(recordId);
  if (!record) return { ok: false, result: fail(404, "record_not_found") };
  return { ok: true, userId: user.id, role: user.role, record };
}

/** 9개 항목이 모두 confirmed_by_worker 이거나 source = worker 여야 전송. 안 된 항목 이름을 돌려줌 */
export function unconfirmedItemKeys(items: ItemRow[]): string[] {
  return items
    .filter((item) => !(item.confirmed_by_worker || item.source === "worker"))
    .map((i) => i.item_key);
}

/** 정하지 않은 '확인 필요'(needs_check 이고 resolution 빈값) 항목 이름 */
export function unresolvedItemKeys(items: ItemRow[]): string[] {
  return items
    .filter((item) => item.status === "needs_check" && item.resolution === null)
    .map((item) => item.item_key);
}

// POST /api/records/:id/submit — 작성자, draft·returned → submitted
export async function submitRecord(recordId: string, deps: TransitionDeps): Promise<ApiResult> {
  const loaded = await load(recordId, deps);
  if (!loaded.ok) return loaded.result;
  const { record, userId } = loaded;

  if (record.worker_id !== userId) return fail(403, "not_record_worker");
  if (record.status !== "draft" && record.status !== "returned") {
    return fail(409, "invalid_transition");
  }

  const items = await deps.listItems(recordId);
  const unconfirmed = unconfirmedItemKeys(items);
  if (items.length !== 9 || unconfirmed.length > 0) {
    return fail(409, "unconfirmed_items", { items: unconfirmed });
  }

  const updated = await deps.update(
    recordId,
    record.status,
    { status: "submitted" },
    "status, submitted_at",
  );
  return updated.ok ? { status: 200, body: updated.row } : fromUpdateError(updated.error);
}

// POST /api/records/:id/approve — 같은 기관 관리자(교육용 기관은 강사), submitted → approved
export async function approveRecord(recordId: string, deps: TransitionDeps): Promise<ApiResult> {
  const loaded = await load(recordId, deps);
  if (!loaded.ok) return loaded.result;
  const { record, role } = loaded;

  if (role !== "reviewer") return fail(403, "reviewer_only");
  if (record.status !== "submitted") return fail(409, "invalid_transition");

  const unresolved = unresolvedItemKeys(await deps.listItems(recordId));
  if (unresolved.length > 0) return fail(409, "unresolved_needs_check", { items: unresolved });

  const updated = await deps.update(
    recordId,
    "submitted",
    { status: "approved" },
    "status, approved_at",
  );
  if (updated.ok) return { status: 200, body: updated.row };
  if (updated.error === "unresolved_needs_check") {
    // 검사와 승인 사이에 항목이 바뀐 경우: 남은 항목을 다시 읽어 돌려준다
    const items = unresolvedItemKeys(await deps.listItems(recordId));
    return fail(409, "unresolved_needs_check", { items });
  }
  return fromUpdateError(updated.error);
}

export function parseReturnReason(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const reason = (body as { reason?: unknown }).reason;
  if (typeof reason !== "string" || reason.trim() === "") return null;
  return reason.trim();
}

// POST /api/records/:id/return — 같은 기관 관리자, submitted → returned.
// reason은 '[식사, 복약 관찰] 사유'처럼 항목 이름을 포함한 한국어 문자열 전체다.
// 관리자는 한국어로만 보내고, 모국어 번역은 작성자 화면 쪽에서 한다(결정 2026-10-28-되돌림사유한국어).
// 지난 되돌림의 번역이 남지 않게 return_reason_native는 비운다.
export async function returnRecord(
  recordId: string,
  body: unknown,
  deps: TransitionDeps,
): Promise<ApiResult> {
  const loaded = await load(recordId, deps);
  if (!loaded.ok) return loaded.result;
  const { record, role } = loaded;

  if (role !== "reviewer") return fail(403, "reviewer_only");
  const reason = parseReturnReason(body);
  if (!reason) return fail(400, "return_reason_required");
  if (record.status !== "submitted") return fail(409, "invalid_transition");

  const updated = await deps.update(
    recordId,
    "submitted",
    { status: "returned", return_reason: reason, return_reason_native: "" },
    "status, return_reason",
  );
  return updated.ok ? { status: 200, body: updated.row } : fromUpdateError(updated.error);
}
