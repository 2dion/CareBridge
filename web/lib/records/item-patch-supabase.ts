import "server-only";

import { saveItemTranslation, readRecordItems } from "@/lib/agent/draft-repository";
import type { NativeLang } from "@/lib/auth/signup";
import { translateShort } from "@/lib/ai/translate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ItemPatchDeps } from "./item-patch";
import type { RecordRow } from "./transition";
import { readCurrentUser } from "./transition-supabase";

// 항목 고치기의 DB 호출. 수정은 로그인한 사람 권한(RLS)으로, 번역 저장만 서버 전용 save_ai_item으로 한다.
export async function createItemPatchDeps(): Promise<ItemPatchDeps> {
  const supabase = await createSupabaseServerClient();
  const server = createSupabaseAdminClient();

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
    async currentValueKo(recordId, key) {
      const { data } = await supabase
        .from("record_items")
        .select("value_ko")
        .eq("record_id", recordId)
        .eq("item_key", key)
        .maybeSingle();
      return data ? (data.value_ko as string) : null;
    },
    async update(recordId, key, patch) {
      const { data, error } = await supabase
        .from("record_items")
        .update(patch)
        .eq("record_id", recordId)
        .eq("item_key", key)
        .select("id");
      if (error) return { ok: false, error: error.message };
      // RLS로 걸러지면 오류 없이 0행이 된다
      if (!data || data.length === 0) return { ok: false, error: "no_rows" };
      return { ok: true };
    },
    // 번역은 작성자 모국어로 한다. 작성자는 자기 profiles를 읽고,
    // 담당자는 작성자 profiles를 읽지 못하므로(기록계약보강) 서버가 그 한 칸만 읽는다.
    async translationLang(record, user) {
      const client = record.worker_id === user.id ? supabase : server;
      const { data } = await client
        .from("profiles")
        .select("native_lang")
        .eq("id", record.worker_id)
        .maybeSingle();
      return (data?.native_lang as NativeLang | undefined) ?? null;
    },
    translate: translateShort,
    async saveTranslation(recordId, key, actorId, expectedValueKo, valueNative) {
      try {
        await saveItemTranslation(server, recordId, key, actorId, expectedValueKo, valueNative);
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        return { ok: false, error: message.includes("stale_item") ? "stale_item" : message };
      }
    },
    async readItem(recordId, key) {
      const items = await readRecordItems(supabase, recordId);
      return items.find((item) => item.item_key === key) ?? null;
    },
  };
}
