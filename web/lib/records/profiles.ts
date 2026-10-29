import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffMember = { id: string; name: string; role: "worker" | "reviewer" };

// 관리자는 다른 계정의 글자 크기·온보딩 여부 등 개인 설정을 조회하지 않는다.
export async function listOrgStaff(userClient: SupabaseClient): Promise<StaffMember[]> {
  const { data, error } = await userClient.rpc("list_org_staff");
  if (error) throw new Error(`기관 명단 조회 실패: ${error.message}`);
  return data as StaffMember[];
}
