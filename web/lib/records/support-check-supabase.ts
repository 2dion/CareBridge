import "server-only";

import { parseNativeLang } from "@/lib/auth/signup";
import type { SupabaseClient } from "@supabase/supabase-js";

import { saveItemCheck } from "@/lib/agent/draft-repository";
import { minutesBetween, resolveVisitMinutes, type ItemStatus } from "@/lib/agent/validate-draft";

import { toFormType } from "./form-type";
import type { SupportCheckDeps, SupportCheckTarget } from "./support-check";

type ItemRow = {
  item_key: string;
  value_ko: string;
  status: ItemStatus;
  reason: string;
  reason_native: string;
  detail: Record<string, unknown> | null;
};

// 제공 지원 재검사의 DB 호출. 읽기는 로그인한 작성자 권한(RLS)으로, 저장만 서버 전용 save_ai_item(check)으로 한다.
export function createSupportCheckDeps(
  userClient: SupabaseClient,
  serverClient: SupabaseClient,
): SupportCheckDeps {
  return {
    async readTarget(recordId): Promise<SupportCheckTarget | null> {
      const { data: record } = await userClient
        .from("records")
        .select("form_type, visit_start, visit_end, form_fields, native_lang")
        .eq("id", recordId)
        .maybeSingle();
      if (!record || toFormType(record.form_type) !== "12") return null;
      const { data: items } = await userClient
        .from("record_items")
        .select("item_key, value_ko, status, reason, reason_native, detail")
        .eq("record_id", recordId)
        .in("item_key", ["support", "visit_time"]);
      const rows = (items ?? []) as ItemRow[];
      const support = rows.find((item) => item.item_key === "support");
      if (!support) return null;
      const visitTime = rows.find((item) => item.item_key === "visit_time");
      // 이유 번역 언어는 기록을 만든 때 언어다. 작성자가 나중에 바꾼 프로필 언어가 아니다(이슈 #336)
      const known =
        record.visit_start && record.visit_end
          ? minutesBetween(record.visit_start, record.visit_end)
          : null;
      return {
        careType: "home",
        nativeLang: parseNativeLang(record.native_lang),
        visitMinutes: resolveVisitMinutes(
          known,
          (record.form_fields as Record<string, unknown> | null) ?? {},
          visitTime?.detail ?? {},
        ),
        support: {
          value_ko: support.value_ko,
          status: support.status,
          reason: support.reason,
          reason_native: support.reason_native,
          detail: support.detail ?? {},
        },
      };
    },
    async applyCheck(recordId, actorId, expectedValueKo, patch) {
      await saveItemCheck(serverClient, recordId, actorId, expectedValueKo, patch);
    },
  };
}
