import { createUploadUrl } from "@/lib/audio/audio-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// POST /api/records/:id/audio/upload-url: 작성자가 녹음을 올릴 1회용 주소를 받음(W2, W3 항목 보태기).
// 입력: target(record / item), item_key(항목 보태기), mime_type(audio/webm / audio/mp4). 형식이 다르면 415.
// 근거: 문서/결정/2026-10-21-녹음업로드.md
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/records/[id]/audio/upload-url">,
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await createUploadUrl(await createSupabaseServerClient(), id, body);
  return Response.json(result.body, { status: result.status });
}
