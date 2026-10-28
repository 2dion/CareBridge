import { cleanupOldAudio } from "@/lib/audio/cleanup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET /api/cron/audio-cleanup: 1시간 넘은 녹음 파일 정리. GitHub Actions(audio-cleanup.yml)가 매시간 부른다.
// Authorization: Bearer {CRON_SECRET}가 맞아야 돈다. CRON_SECRET이 없으면 돌지 않는다.
// 근거: 문서/결정/2026-10-21-녹음업로드.md 4번
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "cron_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await cleanupOldAudio(createSupabaseAdminClient());
  return Response.json(result);
}
