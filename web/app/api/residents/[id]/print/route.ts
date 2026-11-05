import { printPeriod } from "@/lib/records/period-print";
import { createPeriodPrintDeps } from "@/lib/records/period-print-supabase";

// GET /api/residents/:id/print?from=YYYY-MM-DD&to=YYYY-MM-DD: 관리자·강사가 한 어르신의 승인한 기록 여러 날을
// 법정 원문의 날짜 열에 모아 찍기 위한 날짜별 데이터를 받음(M3 · 기간 인쇄). to가 없으면 서식 한 장(제12호 7일, 제16호 3일),
// 있으면 그 날까지(최대 31일)이고 화면이 날짜 수마다 새 서식 장으로 나눈다. PDF 모양은 화면(FE)이 만든다.
// 근거: 문서/설계/데이터구조-v2.3.6.md '공통 계약' GET /api/residents/:id/print, 문서/결정/2026-11-03-기간인쇄.md, 문서/결정/2026-11-05-기간인쇄여러장.md
export async function GET(request: Request, ctx: RouteContext<"/api/residents/[id]/print">) {
  const { id } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const result = await printPeriod(
    id,
    params.get("from"),
    await createPeriodPrintDeps(),
    params.get("to"),
  );
  return Response.json(result.body, { status: result.status });
}
