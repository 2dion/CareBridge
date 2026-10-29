import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Role } from "@/lib/auth/signup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ItemRow, RecordRow, TransitionDeps } from "./transition";

/** 로그인한 사람 id와 role. 로그인하지 않았거나 프로필이 없으면 null */
export async function readCurrentUser(supabase: SupabaseClient) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile) return null;
  return { id: auth.user.id, role: profile.role as Role };
}

// submit·approve·return의 DB 호출. 읽기·쓰기는 모두 로그인한 사람 권한(RLS)으로 한다.
export async function createTransitionDeps(): Promise<TransitionDeps> {
  const supabase = await createSupabaseServerClient();

  return {
    currentUser: () => readCurrentUser(supabase),
    async findRecord(recordId) {
      const { data } = await supabase
        .from("records")
        .select("id, status, worker_id")
        .eq("id", recordId)
        .maybeSingle();
      return (data as RecordRow | null) ?? null;
    },
    async listItems(recordId) {
      const { data, error } = await supabase
        .from("record_items")
        .select("item_key, status, source, confirmed_by_worker, resolution")
        .eq("record_id", recordId);
      if (error) throw new Error(`기록 항목 조회 실패: ${error.message}`);
      return data as ItemRow[];
    },
    async update(recordId, from, patch, columns) {
      const { data, error } = await supabase
        .from("records")
        .update(patch)
        .eq("id", recordId)
        .eq("status", from)
        .select(columns);
      if (error) return { ok: false, error: error.message };
      // RLS로 걸러지거나 그사이 상태가 바뀌면 오류 없이 0행이 된다
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (rows.length === 0) return { ok: false, error: "no_rows" };
      return { ok: true, row: rows[0] };
    },
  };
}
