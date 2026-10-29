import { approveRecord } from "@/lib/records/transition";
import { createTransitionDeps } from "@/lib/records/transition-supabase";

// POST /api/records/:id/approve: 관리자가 승인(M2). 정하지 않은 '확인 필요'가 남으면 거절하고 남은 항목을 돌려준다.
// 근거: 문서/설계/데이터구조-v1.6.4.md '승인 서버 검사', AGENTS.md 원칙 3
export async function POST(_request: Request, ctx: RouteContext<"/api/records/[id]/approve">) {
  const { id } = await ctx.params;
  const result = await approveRecord(id, await createTransitionDeps());
  return Response.json(result.body, { status: result.status });
}
