import { printPeriod } from "@/lib/records/period-print";
import { createPeriodPrintDeps } from "@/lib/records/period-print-supabase";

// GET /api/residents/:id/print?from=YYYY-MM-DD: 관리자·강사가 한 어르신의 승인한 기록 여러 날(제12호 7일, 제16호 3일)을
// 법정 원문 한 장에 모아 찍기 위한 날짜별 데이터를 받음(M3 · 기간 인쇄). PDF 모양은 화면(FE)이 만든다.
// 근거: 문서/설계/데이터구조-v2.3.1.md '공통 계약' GET /api/residents/:id/print, 문서/결정/2026-11-03-기간인쇄.md
export async function GET(request: Request, ctx: RouteContext<"/api/residents/[id]/print">) {
  const { id } = await ctx.params;
  const from = new URL(request.url).searchParams.get("from");
  const result = await printPeriod(id, from, await createPeriodPrintDeps());
  return Response.json(result.body, { status: result.status });
}
