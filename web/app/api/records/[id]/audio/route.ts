import { after } from "next/server";

import { receiveAudio } from "@/lib/audio/audio-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// POST /api/records/:id/audio: 업로드가 끝난 뒤 작성자가 부름. 같은 요청 안에서 받아쓰고 파일을 지운다.
// 기록 전체(record)는 202 + status = filling을 돌려주고 Agent를 응답 뒤에 돌린다. 화면은 audio_jobs 상태를 본다.
// 항목 보태기(item)는 그 항목을 다시 써서 200 + item을 돌려준다.
// 근거: 문서/결정/2026-10-21-녹음업로드.md 3·4번, 문서/설계/ai규칙-v1.1.5.md ①·②·③
export const maxDuration = 300; // 받아쓰기 + 응답 뒤 Agent(Claude 응답 최대 4번)

export async function POST(request: Request, ctx: RouteContext<"/api/records/[id]/audio">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await receiveAudio(
    await createSupabaseServerClient(),
    createSupabaseAdminClient(),
    id,
    body,
    (task) => after(task),
  );
  return Response.json(result.body, { status: result.status });
}
