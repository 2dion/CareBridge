// 항목 하나 고치기: PATCH /api/records/:id/items/:key (W3 작성자, M2 관리자·강사).
// 근거: 문서/설계/데이터구조-v1.6.6.md '공통 계약' PATCH 규칙, 문서/결정/2026-10-28-항목하나저장.md
// 순서: ① 로그인한 사람 권한으로 저장(트리거가 확인 풀림·재확인·옛 번역 비움·이력을 맡음)
//       ② value_ko가 바뀌었으면 서버가 다시 번역 ③ save_ai_item(translation)으로 번역만 저장.
// DB·번역 호출은 ItemPatchDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

import { ITEM_KEYS, ITEM_STATUSES, type ItemKey } from "@/lib/agent/validate-draft";
import type { NativeLang, Role } from "@/lib/auth/signup";

import type { ApiResult, RecordRow } from "./transition";

export type ItemPatch = Partial<{
  value_ko: string;
  status: (typeof ITEM_STATUSES)[number];
  detail: Record<string, unknown>;
  confirmed_by_worker: boolean;
  resolution: "confirmed_by_reviewer" | "omitted" | null;
  resolution_note: string;
}>;

export type ItemPatchDeps = {
  currentUser(): Promise<{ id: string; role: Role } | null>;
  findRecord(recordId: string): Promise<RecordRow | null>;
  /** 지금 value_ko. 항목이 없으면 null */
  currentValueKo(recordId: string, key: ItemKey): Promise<string | null>;
  /** 로그인한 사람 권한으로 저장. 0행이면 error = "no_rows" */
  update(
    recordId: string,
    key: ItemKey,
    patch: ItemPatch,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  /** 번역할 언어. null이면 번역하지 않음 */
  translationLang(record: RecordRow, user: { id: string; role: Role }): Promise<NativeLang | null>;
  /** ④ 짧은 번역 */
  translate(textKo: string, lang: NativeLang): Promise<string>;
  /** save_ai_item(translation). 그사이 value_ko가 바뀌면 error = "stale_item" */
  saveTranslation(
    recordId: string,
    key: ItemKey,
    actorId: string,
    expectedValueKo: string,
    valueNative: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  /** 로그인한 사람 권한으로 다시 읽은 항목 1행 */
  readItem(recordId: string, key: ItemKey): Promise<Record<string, unknown> | null>;
  /** 재가 제공 지원 재검사(검사 5). records/support-check.ts recheckSupportMinutes */
  recheckSupport(recordId: string, actorId: string): Promise<unknown>;
};

const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });

// DB 트리거 오류 키 → 응답 코드 (supabase/README.md 오류 키 표, 결정 2026-10-28-기록안함사유)
const DB_ERRORS: Record<string, number> = {
  invalid_transition: 409,
  record_locked: 409,
  reviewer_only: 403,
  not_record_worker: 403,
  human_value_protected: 409,
  note_required: 400,
};

const RESOLUTIONS = [null, "confirmed_by_reviewer", "omitted"] as const;

/**
 * 한국어가 아닌 글인지. 글자(문자)는 있는데 한글 음절이 하나도 없으면 true.
 * 숫자·기호만 있는 값("14:00~17:00")은 막지 않는다.
 */
export function isNotKorean(text: string) {
  return /\p{L}/u.test(text) && !/[\uAC00-\uD7A3]/.test(text);
}

/** 바꿀 칸만 골라 형식을 검사한다. 하나도 없거나 형식이 틀리면 null */
export function parseItemPatch(body: unknown): ItemPatch | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const patch: ItemPatch = {};
  if ("value_ko" in input) {
    if (typeof input.value_ko !== "string") return null;
    patch.value_ko = input.value_ko.trim();
  }
  if ("status" in input) {
    if (!ITEM_STATUSES.includes(input.status as never)) return null;
    patch.status = input.status as ItemPatch["status"];
  }
  if ("detail" in input) {
    const detail = input.detail;
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
    patch.detail = detail as Record<string, unknown>;
  }
  if ("confirmed_by_worker" in input) {
    if (typeof input.confirmed_by_worker !== "boolean") return null;
    patch.confirmed_by_worker = input.confirmed_by_worker;
  }
  if ("resolution" in input) {
    if (!RESOLUTIONS.includes(input.resolution as never)) return null;
    patch.resolution = input.resolution as ItemPatch["resolution"];
  }
  if ("resolution_note" in input) {
    if (typeof input.resolution_note !== "string") return null;
    patch.resolution_note = input.resolution_note;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export async function patchItem(
  recordId: string,
  key: string,
  body: unknown,
  deps: ItemPatchDeps,
): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return fail(401, "not_signed_in");
  if (!ITEM_KEYS.includes(key as ItemKey)) return fail(400, "invalid_item");
  const itemKey = key as ItemKey;
  const patch = parseItemPatch(body);
  if (!patch) return fail(400, "invalid_input");

  const record = await deps.findRecord(recordId);
  if (!record) return fail(404, "record_not_found");
  if (record.status === "approved") return fail(409, "record_locked");

  // PATCH 규칙: draft·returned면 작성자만, submitted면 관리자만
  const isWorker = record.worker_id === user.id;
  if (record.status === "submitted") {
    if (user.role !== "reviewer") return fail(403, "reviewer_only");
    if ("confirmed_by_worker" in patch) return fail(403, "not_record_worker"); // [확인 완료]는 작성자만
  } else {
    if (!isWorker) return fail(403, "not_record_worker");
    if ("resolution" in patch || "resolution_note" in patch) return fail(403, "reviewer_only");
  }

  // value_ko는 공식 기록(한국어)이다. 글자는 있는데 한글이 하나도 없는 글은 받지 않는다(이슈 #118)
  if (patch.value_ko && isNotKorean(patch.value_ko)) return fail(400, "value_ko_not_korean");

  const before = await deps.currentValueKo(recordId, itemKey);
  if (before === null) return fail(400, "invalid_item");

  const updated = await deps.update(recordId, itemKey, patch);
  if (!updated.ok) {
    if (updated.error === "no_rows") return fail(409, "invalid_transition");
    const status = DB_ERRORS[updated.error];
    return status ? fail(status, updated.error) : fail(500, "update_failed");
  }

  // value_ko가 바뀐 항목만 다시 번역한다. 번역이 실패해도 저장한 수정은 그대로 둔다(번역 칸은 트리거가 비움).
  if (patch.value_ko !== undefined && patch.value_ko !== before && patch.value_ko !== "") {
    await retranslate(recordId, itemKey, record, user, patch.value_ko, deps).catch((error) => {
      console.error("item retranslate failed", recordId, itemKey, error);
    });
  }

  // 재가에서 작성자가 지원별 분(support.detail.minutes)이나 방문 시점을 고치면 검사 5(합 ≤ 방문 시간)를
  // 다시 해 제공 지원의 '확인 필요'와 이유를 맞춘다(이슈 #116). 검사가 실패해도 저장한 수정은 그대로 두되 로그에 남긴다.
  if (isWorker && (itemKey === "support" || itemKey === "visit_time")) {
    await deps.recheckSupport(recordId, user.id).catch((error) => {
      console.error("support recheck failed", recordId, itemKey, error);
    });
  }

  const item = await deps.readItem(recordId, itemKey);
  return item ? { status: 200, body: item } : fail(404, "record_not_found");
}

async function retranslate(
  recordId: string,
  key: ItemKey,
  record: RecordRow,
  user: { id: string; role: Role },
  valueKo: string,
  deps: ItemPatchDeps,
) {
  const lang = await deps.translationLang(record, user);
  if (!lang || lang === "ko") return;
  let text = valueKo;
  // 그사이 또 고쳤으면(stale_item) 새 글로 한 번 더 한다(결정 2026-10-28-항목하나저장 4번)
  for (let attempt = 0; attempt < 2; attempt++) {
    const native = await deps.translate(text, lang);
    if (!native) return;
    const saved = await deps.saveTranslation(recordId, key, user.id, text, native);
    if (saved.ok || saved.error !== "stale_item") return;
    const latest = await deps.currentValueKo(recordId, key);
    if (!latest) return;
    text = latest;
  }
}
