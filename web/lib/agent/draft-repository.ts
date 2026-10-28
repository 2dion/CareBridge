import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBlockedNames } from "./blocked-names";
import { ITEM_KEYS, validateDraft, type DraftItem, type ValidateContext } from "./validate-draft";

export type StoredDraftItem = DraftItem & {
  id: string;
  source: "ai" | "worker" | "reviewer";
  confirmed: boolean;
  resolution: "confirmed_by_reviewer" | "omitted" | null;
};

const ITEM_COLUMNS =
  "id,item_key,value_ko,value_native,status,evidence,reason,reason_native,detail,source,confirmed,resolution";

export async function readRecordItems(userClient: SupabaseClient, recordId: string) {
  const { data, error } = await userClient
    .from("record_items")
    .select(ITEM_COLUMNS)
    .eq("record_id", recordId);
  if (error) throw new Error(`기록 항목 조회 실패: ${error.message}`);
  return (data as unknown as StoredDraftItem[]).sort(
    (a, b) => ITEM_KEYS.indexOf(a.item_key) - ITEM_KEYS.indexOf(b.item_key),
  );
}

// 호출자는 원문을 먼저 작성자 권한으로 저장한다. service_role의 범용 UPDATE는 사용하지 않는다.
export async function saveValidatedDraft(
  userClient: SupabaseClient,
  serverClient: SupabaseClient,
  recordId: string,
  rawDraft: unknown,
) {
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) throw new Error("unauthenticated");
  const { data: record, error } = await userClient
    .from("records")
    .select("id,worker_id,transcript,form_type,visit_start,visit_end")
    .eq("id", recordId)
    .single();
  if (error || !record || record.worker_id !== auth.user.id) throw new Error("not_record_worker");
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("native_lang")
    .eq("id", auth.user.id)
    .single();
  if (profileError || !profile) throw new Error("profile_not_found");
  const context: ValidateContext = {
    nativeLang: profile.native_lang === "ko" ? "ko" : "vi",
    transcript: record.transcript,
    careType: record.form_type === "12" ? "home" : "facility",
    blockedNames: await getBlockedNames(serverClient, recordId, auth.user.id),
  };
  if (record.visit_start && record.visit_end) {
    const minutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };
    context.visitMinutes = minutes(record.visit_end) - minutes(record.visit_start);
  }
  const validation = validateDraft(rawDraft, context);
  if (!validation.fixed) throw new Error("invalid_draft");
  const { error: saveError } = await serverClient.rpc("save_record_ai_draft", {
    p_record_id: recordId,
    p_worker_id: auth.user.id,
    p_expected_transcript: record.transcript,
    p_draft: validation.fixed,
  });
  if (saveError) throw new Error(`초안 저장 실패: ${saveError.message}`);
  // RPC 응답을 그대로 믿고 끝내지 않고, 사용자 RLS로 재조회하여 저장된 번역을 돌려준다.
  return { validation, items: await readRecordItems(userClient, recordId) };
}
