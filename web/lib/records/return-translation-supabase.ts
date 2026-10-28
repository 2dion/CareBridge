import "server-only";

import { translateShort } from "@/lib/ai/translate";
import type { NativeLang, Role } from "@/lib/auth/signup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ReturnTranslationDeps, ReturnedRecord } from "./return-translation";

// 되돌린 사유 번역의 DB 호출. 읽기는 작성자 권한(RLS), 번역 저장만 서버 전용 RPC.
export async function createReturnTranslationDeps(): Promise<ReturnTranslationDeps> {
  const supabase = await createSupabaseServerClient();

  return {
    async currentUser() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, native_lang")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!profile) return null;
      return {
        id: auth.user.id,
        role: profile.role as Role,
        nativeLang: (profile.native_lang === "ko" ? "ko" : "vi") as NativeLang,
      };
    },
    async findRecord(recordId) {
      const { data } = await supabase
        .from("records")
        .select("id, status, worker_id, return_reason, return_reason_native")
        .eq("id", recordId)
        .maybeSingle();
      return (data as ReturnedRecord | null) ?? null;
    },
    translate: translateShort,
    async save(recordId, workerId, expectedReason, native) {
      const { data, error } = await createSupabaseAdminClient().rpc("save_return_reason_native", {
        p_record_id: recordId,
        p_worker_id: workerId,
        p_expected_reason: expectedReason,
        p_native: native,
      });
      if (error) {
        const key = ["stale_reason", "not_record_worker", "invalid_transition", "not_found"].find(
          (k) => error.message.includes(k),
        );
        return { ok: false, error: key ?? error.message };
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows[0] ? { ok: true, row: rows[0] } : { ok: false, error: "not_found" };
    },
  };
}
