// 되돌린 사유의 모국어 번역: POST /api/records/:id/return/translate (작성자, W3·W4).
// 근거: 문서/결정/2026-10-28-되돌림사유번역.md, 2026-10-28-되돌림사유한국어.md 4번
// 담당자는 한국어만 저장하고, 작성자가 수정 필요 기록을 열 때 서버가 작성자 언어로 번역해 채운다.
// 번역 저장은 service_role 전용 save_return_reason_native(사유가 그사이 바뀌면 stale_reason).
// DB·번역 호출은 ReturnTranslationDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

import type { NativeLang, Role } from "@/lib/auth/signup";

import type { ApiResult, RecordStatus } from "./transition";

export type ReturnedRecord = {
  id: string;
  status: RecordStatus;
  worker_id: string;
  return_reason: string;
  return_reason_native: string;
};

export type ReturnTranslationDeps = {
  currentUser(): Promise<{ id: string; role: Role; nativeLang: NativeLang } | null>;
  /** 로그인한 사람 권한(RLS)으로 읽음. 볼 수 없으면 null */
  findRecord(recordId: string): Promise<ReturnedRecord | null>;
  /** ④ 짧은 번역. Mock이면 빈 문자열 */
  translate(textKo: string, lang: NativeLang): Promise<string>;
  /** save_return_reason_native. 그사이 사유가 바뀌면 error = "stale_reason" */
  save(
    recordId: string,
    workerId: string,
    expectedReason: string,
    native: string,
  ): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }>;
};

const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });

const DB_ERRORS: Record<string, number> = {
  not_record_worker: 403,
  invalid_transition: 409,
  not_found: 404,
};

export async function translateReturnReason(
  recordId: string,
  deps: ReturnTranslationDeps,
): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return fail(401, "not_signed_in");
  let record = await deps.findRecord(recordId);
  if (!record) return fail(404, "record_not_found");
  if (record.worker_id !== user.id) return fail(403, "not_record_worker");
  if (record.status !== "returned") return fail(409, "invalid_transition");

  const done = (row: ReturnedRecord | Record<string, unknown>) => ({
    status: 200,
    body: {
      status: row.status,
      return_reason: row.return_reason,
      return_reason_native: row.return_reason_native,
    },
  });
  // 이미 번역돼 있거나, 작성자가 한국어를 쓰면 번역하지 않는다(토큰 절약)
  if (record.return_reason_native || user.nativeLang === "ko" || !record.return_reason) {
    return done(record);
  }

  // 그사이 담당자가 다시 되돌려 사유가 바뀌었으면(stale_reason) 새 사유로 한 번 더
  for (let attempt = 0; attempt < 2; attempt++) {
    let native: string;
    try {
      native = await deps.translate(record.return_reason, user.nativeLang);
    } catch {
      return fail(502, "translation_failed");
    }
    if (!native) return done(record); // Mock 모드: 빈칸은 번역 완료가 아님
    const saved = await deps.save(recordId, user.id, record.return_reason, native);
    if (saved.ok) return done(saved.row);
    if (saved.error !== "stale_reason") {
      const status = DB_ERRORS[saved.error];
      return status ? fail(status, saved.error) : fail(500, "update_failed");
    }
    const latest = await deps.findRecord(recordId);
    if (!latest || latest.status !== "returned") return fail(409, "invalid_transition");
    record = latest;
  }
  return fail(409, "stale_reason");
}
