// 실명 검사(validate_draft 검사 6)에 넘길 이름 목록을 DB에서 읽는다.
// 근거: 문서/결정/2026-10-21-재가분칸-실명목록.md — 같은 기관 계정의 profiles.name.
// 가명 표시(○)·한 글자 이름을 빼는 일은 validate-draft.ts가 맡는다.
// 서버 전용 RPC만 사용한다. 작성자의 profiles 조회 범위를 넓히지 않는다.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getBlockedNames(
  server: SupabaseClient,
  recordId: string,
  workerId: string,
): Promise<string[]> {
  const { data, error } = await server.rpc("record_blocked_names", {
    p_record_id: recordId,
    p_worker_id: workerId,
  });
  if (error) throw new Error(`실명 검사 목록을 읽지 못했습니다: ${error.message}`);

  const rows = (data ?? []) as { name: string | null }[];
  const names = rows.map((row) => row.name?.trim() ?? "");
  return [...new Set(names.filter((name) => name.length > 0))];
}
