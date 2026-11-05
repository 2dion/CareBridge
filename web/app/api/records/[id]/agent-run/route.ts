import { AgentRunError, runAgentForRecord } from "@/lib/agent/agent-run";
import { enforceQuota } from "@/lib/security/rate-limit-supabase";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// POST /api/records/:id/agent-run: 작성자가 [다시 시도] 또는 [글로 기록] 뒤 부름(W3).
// 입력: (글로 기록이면) text. 출력: end_reason(draft_returned / auto_stopped / failed), items(9개), form_fields.
// 근거: 문서/설계/데이터구조-v2.3.6.md '공통 계약', 문서/설계/ai규칙-v2.0.5.md '② 기록 검토 준비 Agent'
export const maxDuration = 300; // Claude 응답 최대 4번

const STATUS: Record<AgentRunError["code"], number> = {
  not_signed_in: 401,
  record_not_found: 404,
  not_record_worker: 403,
  invalid_transition: 409,
  no_transcript: 400,
  ai_not_configured: 503,
  rate_limited: 429,
};

export async function POST(request: Request, ctx: RouteContext<"/api/records/[id]/agent-run">) {
  const { id } = await ctx.params;
  let text: string | undefined;
  try {
    const body = (await request.json()) as { text?: unknown };
    if (typeof body?.text === "string") text = body.text;
  } catch {
    // 본문이 없으면 [다시 시도]: 저장된 원문으로 다시 돈다
  }

  try {
    const result = await runAgentForRecord(
      await createSupabaseServerClient(),
      createSupabaseAdminClient(),
      id,
      text,
      // 호출 제한은 기록·원문 검사를 지난 뒤 Claude 직전에 센다(이슈 #279)
      { takeQuota: async () => (await enforceQuota("agent")) === null },
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof AgentRunError) {
      return Response.json({ error: error.code }, { status: STATUS[error.code] });
    }
    // Claude·도구가 두 번 실패: 화면은 [다시 시도]와 [글로 기록]를 보여 준다(멈춤 규칙 4)
    console.error("agent-run failed", error);
    return Response.json({ end_reason: "failed", error: "agent_failed" }, { status: 502 });
  }
}
