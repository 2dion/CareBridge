import { translateReturnReason } from "@/lib/records/return-translation";
import { createReturnTranslationDeps } from "@/lib/records/return-translation-supabase";

// POST /api/records/:id/return/translate: 작성자가 되돌아온 기록을 열 때(W3·W4) 되돌린 사유를 모국어로 번역해 채움.
// 입력 없음. 출력 status·return_reason·return_reason_native. 이미 번역됐거나 한국어 작성자면 번역하지 않는다.
// 근거: 문서/결정/2026-10-28-되돌림사유번역.md
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/records/[id]/return/translate">,
) {
  const { id } = await ctx.params;
  const result = await translateReturnReason(id, await createReturnTranslationDeps());
  return Response.json(result.body, { status: result.status });
}
