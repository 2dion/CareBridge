import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AUDIO_BUCKET } from "./audio";

// 1시간 넘게 남은 녹음 파일을 지운다(올리고 /audio를 부르지 않았거나, 받아쓰기 뒤 삭제가 실패한 것).
// 로그인한 사람 없이 돌므로 service_role을 쓰고, SQL이 아니라 Storage API로 지운다(실제 파일이 지워지게).
// 근거: 문서/결정/2026-10-21-녹음업로드.md 4번, 문서/결정/2026-10-27-녹음임시보관.md 5번
export const MAX_AGE_MS = 60 * 60 * 1000;

async function listFolder(server: SupabaseClient, prefix: string) {
  const { data, error } = await server.storage
    .from(AUDIO_BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw new Error(`녹음 목록 읽기 실패: ${error.message}`);
  return data ?? [];
}

export async function cleanupOldAudio(server: SupabaseClient, now = Date.now()) {
  const old: string[] = [];
  // 경로: {org_id}/{record_id}/{uuid}.{webm|mp4}
  for (const org of await listFolder(server, "")) {
    for (const record of await listFolder(server, org.name)) {
      for (const file of await listFolder(server, `${org.name}/${record.name}`)) {
        const created = file.created_at ? Date.parse(file.created_at) : NaN;
        if (Number.isFinite(created) && now - created > MAX_AGE_MS) {
          old.push(`${org.name}/${record.name}/${file.name}`);
        }
      }
    }
  }
  for (let i = 0; i < old.length; i += 100) {
    const { error } = await server.storage.from(AUDIO_BUCKET).remove(old.slice(i, i + 100));
    if (error) throw new Error(`녹음 지우기 실패: ${error.message}`);
  }
  return { removed: old.length };
}
