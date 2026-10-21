// 실명 검사(validate_draft 검사 6)에 넘길 이름 목록을 DB에서 읽는다.
// 근거: 문서/결정/2026-10-21-재가분칸-실명목록.md — 같은 기관 계정의 profiles.name.
// 가명 표시(○)·한 글자 이름을 빼는 일은 validate-draft.ts가 맡는다.
// 요청한 사람의 권한(RLS)으로 읽는다. profiles는 같은 기관 계정만 보인다.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getBlockedNames(supabase: SupabaseClient, orgId: string): Promise<string[]> {
  const { data, error } = await supabase.from("profiles").select("name").eq("org_id", orgId);
  if (error) throw new Error(`실명 검사 목록을 읽지 못했습니다: ${error.message}`);

  const names = (data ?? []).map((row: { name: string | null }) => row.name?.trim() ?? "");
  return [...new Set(names.filter((name) => name.length > 0))];
}
