import { createHelperMessagesDeps } from "@/lib/helper/ask-supabase";
import { listHelperMessages } from "@/lib/helper/messages";

// GET /api/helper/messages: 작성자가 W6(도우미)를 열 때 지난 대화를 불러옴. 내 행만, 오래된 것부터.
// 입력 before(이 시각보다 앞)·limit(기본 50, 최대 100). 출력 messages·next_before(더 이전이 없으면 null).
// 근거: 문서/설계/데이터구조-v1.7.md '공통 계약', 문서/결정/2026-10-31-도우미대화저장.md
export async function GET(request: Request) {
  try {
    const result = await listHelperMessages(
      new URL(request.url).searchParams,
      await createHelperMessagesDeps(),
    );
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("helper/messages failed", error);
    return Response.json({ error: "helper_failed" }, { status: 502 });
  }
}
