// 기록의 번역 언어 기준: 기록을 만든 때 언어(`records.native_lang`, 만든 뒤 바꾸지 않음).
// 근거: 문서/결정/2026-11-05-언어선택화면.md 5번, 2026-11-05-기록언어기준.md (이슈 #336)
// 작성자가 W5에서 모국어를 바꿔도, 옛 기록의 번역·이유·사유는 만든 때 언어로만 저장한다.
// 값이 비었거나 모르는 언어면 ko(번역 없음)로 읽어, 엉뚱한 언어로 번역을 덮지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";

import { parseNativeLang, type NativeLang } from "@/lib/i18n/languages";

/** records.native_lang을 읽는다. 기록을 볼 수 없으면(RLS 포함) null */
export async function readRecordNativeLang(
  client: SupabaseClient,
  recordId: string,
): Promise<NativeLang | null> {
  const { data } = await client
    .from("records")
    .select("native_lang")
    .eq("id", recordId)
    .maybeSingle();
  return data ? parseNativeLang(data.native_lang) : null;
}
