import { returnRecord } from "@/lib/records/transition";
import { createTransitionDeps } from "@/lib/records/transition-supabase";

// POST /api/records/:id/return: 관리자가 사유와 함께 되돌림(M2). 사유는 작성자 모국어로 번역해 함께 저장한다.
// 근거: 문서/설계/데이터구조-v1.6.4.md '공통 계약' 되돌림·번역
export async function POST(request: Request, ctx: RouteContext<"/api/records/[id]/return">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await returnRecord(id, body, await createTransitionDeps());
  return Response.json(result.body, { status: result.status });
}
