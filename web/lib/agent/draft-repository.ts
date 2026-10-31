import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { careTypeOf } from "@/lib/records/form-type";

import { getBlockedNames } from "./blocked-names";
import { ITEM_KEYS, validateDraft, type DraftItem, type ValidateContext } from "./validate-draft";

export type StoredDraftItem = DraftItem & {
  id: string;
  source: "ai" | "worker" | "reviewer";
  confirmed_by_worker: boolean;
  resolution: "confirmed_by_reviewer" | "omitted" | null;
  resolution_note: string;
};

const ITEM_COLUMNS =
  "id,item_key,value_ko,value_native,status,evidence,reason,reason_native,detail,source,confirmed_by_worker,resolution,resolution_note";

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
    careType: careTypeOf(record.form_type),
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

// 항목 하나를 서버가 저장한다(save_ai_item). 근거: 문서/결정/2026-10-28-항목하나저장.md
// 호출자는 actorId를 userClient.auth.getUser()로 확인한 뒤 넘긴다. expectedValueKo는 번역·보태기의 기준 글이다.
export async function saveItemTranslation(
  serverClient: SupabaseClient,
  recordId: string,
  itemKey: DraftItem["item_key"],
  actorId: string,
  expectedValueKo: string,
  valueNative: string,
) {
  return saveAiItem(serverClient, recordId, itemKey, actorId, expectedValueKo, "translation", {
    value_native: valueNative,
  });
}

export async function saveAddedItem(
  serverClient: SupabaseClient,
  recordId: string,
  actorId: string,
  expectedValueKo: string,
  item: DraftItem,
) {
  const { item_key, ...fields } = item;
  return saveAiItem(serverClient, recordId, item_key, actorId, expectedValueKo, "item", fields);
}

// 재가 제공 지원 재검사(검사 5) 결과: status·reason·reason_native만 바꾼다. 출처·[확인 완료]·내용은 그대로.
// 근거: 문서/결정/2026-10-29-초안검사보강.md (이슈 #116)
export async function saveItemCheck(
  serverClient: SupabaseClient,
  recordId: string,
  actorId: string,
  expectedValueKo: string,
  check: { status: DraftItem["status"]; reason: string; reason_native: string },
) {
  return saveAiItem(serverClient, recordId, "support", actorId, expectedValueKo, "check", check);
}

async function saveAiItem(
  serverClient: SupabaseClient,
  recordId: string,
  itemKey: DraftItem["item_key"],
  actorId: string,
  expectedValueKo: string,
  mode: "translation" | "item" | "check",
  item: Record<string, unknown>,
) {
  const { data, error } = await serverClient.rpc("save_ai_item", {
    p_record_id: recordId,
    p_item_key: itemKey,
    p_actor_id: actorId,
    p_expected_value_ko: expectedValueKo,
    p_mode: mode,
    p_item: item,
  });
  // stale_item이면 그사이 value_ko가 또 바뀐 것: 새 글로 다시 번역·보태기 한다.
  if (error) throw new Error(`항목 저장 실패: ${error.message}`);
  return (data as StoredDraftItem[])[0];
}
