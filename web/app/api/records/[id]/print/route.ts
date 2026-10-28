import { printRecord } from "@/lib/records/print";
import { createPrintDeps } from "@/lib/records/print-supabase";

// GET /api/records/:id/print: 담당자·강사가 승인한 기록의 인쇄 데이터를 받음(R3). 인쇄 모양은 화면(FE)이 만든다.
// 근거: 문서/설계/데이터구조-v1.6.2.md '공통 계약' print
export async function GET(_request: Request, ctx: RouteContext<"/api/records/[id]/print">) {
  const { id } = await ctx.params;
  const result = await printRecord(id, await createPrintDeps());
  return Response.json(result.body, { status: result.status });
}
