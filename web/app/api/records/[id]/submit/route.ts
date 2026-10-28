import { submitRecord } from "@/lib/records/transition";
import { createTransitionDeps } from "@/lib/records/transition-supabase";

// POST /api/records/:id/submit: 작성자가 기록을 보냄(W3). 9개 항목이 모두 확인돼야 보낼 수 있다.
// 근거: 문서/설계/데이터구조-v1.6.2.md '공통 계약' submit 조건
export async function POST(_request: Request, ctx: RouteContext<"/api/records/[id]/submit">) {
  const { id } = await ctx.params;
  const result = await submitRecord(id, await createTransitionDeps());
  return Response.json(result.body, { status: result.status });
}
