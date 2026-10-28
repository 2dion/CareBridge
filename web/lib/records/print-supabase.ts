import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { PrintDeps, PrintItem, PrintRecordRow } from "./print";
import { readCurrentUser } from "./transition-supabase";

// 인쇄용 기록의 DB 호출. 로그인한 사람 권한(RLS)으로 읽는다.
export async function createPrintDeps(): Promise<PrintDeps> {
  const supabase = await createSupabaseServerClient();

  return {
    currentUser: () => readCurrentUser(supabase),
    async findRecord(recordId) {
      const { data } = await supabase
        .from("records")
        .select(
          "id, status, form_type, form_fields, care_date, visit_start, visit_end, organizations(is_training)",
        )
        .eq("id", recordId)
        .maybeSingle();
      if (!data) return null;
      const { organizations, ...record } = data as unknown as Omit<
        PrintRecordRow,
        "is_training"
      > & { organizations: { is_training: boolean } | null };
      return { ...record, is_training: Boolean(organizations?.is_training) };
    },
    async listItems(recordId) {
      const { data, error } = await supabase
        .from("record_items")
        .select("item_key, value_ko, status, detail, resolution")
        .eq("record_id", recordId);
      if (error) throw new Error(`기록 항목 조회 실패: ${error.message}`);
      return data as PrintItem[];
    },
  };
}
