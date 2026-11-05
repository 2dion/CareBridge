import { askHelper, isValidHelperQuestion } from "@/lib/helper/ask";
import { createHelperDeps } from "@/lib/helper/ask-supabase";
import { enforceQuota } from "@/lib/security/rate-limit-supabase";

// POST /api/helper/ask: 작성자가 W6(도우미)에서 질문. 교재에서 찾은 내용만으로 답하고, 답한 질문은 helper_messages에 남긴다.
// 입력 question. 출력 ko(한국어)·vi(모국어)·source(장·절·쪽)·found(교재에서 찾았는지)·id·created_at(저장한 행, 저장 실패면 null).
// 근거: 문서/설계/데이터구조-v2.3.6.md '공통 계약', 문서/설계/ai규칙-v2.0.5.md '도우미·번역 규칙'
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  // 형식이 맞는 질문만 호출 제한을 센다. 잘못된 요청은 AI를 부르지 않으므로 세지 않는다(이슈 #279)
  if (isValidHelperQuestion(body)) {
    const limited = await enforceQuota("helper");
    if (limited) return limited;
  }
  try {
    const result = await askHelper(body, await createHelperDeps());
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("helper/ask failed", error);
    return Response.json({ error: "helper_failed" }, { status: 502 });
  }
}
