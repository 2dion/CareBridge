import { createHelperConversationsDeps } from "@/lib/helper/ask-supabase";
import { listHelperConversations } from "@/lib/helper/conversations";

// GET /api/helper/conversations: 작성자가 W6 · 이전 대화에서 내 대화 목록을 불러옴. 마지막 질문 시각 최근 순.
// 입력 before(이 last_message_at보다 앞)·limit(기본 20, 최대 50). 출력 conversations·next_before(더 이전이 없으면 null).
// 근거: 문서/설계/데이터구조-v2.3.7.md '공통 계약', 문서/결정/2026-11-03-도우미대화묶음.md
export async function GET(request: Request) {
  try {
    const result = await listHelperConversations(
      new URL(request.url).searchParams,
      await createHelperConversationsDeps(),
    );
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("helper/conversations failed", error);
    return Response.json({ error: "helper_failed" }, { status: 502 });
  }
}
