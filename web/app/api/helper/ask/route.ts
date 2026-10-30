import { askHelper } from "@/lib/helper/ask";
import { createHelperDeps } from "@/lib/helper/ask-supabase";

// POST /api/helper/ask: 작성자가 W6(도우미)에서 질문. 교재에서 찾은 내용만으로 답하고 저장하지 않는다.
// 입력 question. 출력 ko(한국어)·vi(모국어)·source(장·절·쪽)·found(교재에서 찾았는지).
// 근거: 문서/설계/데이터구조-v1.6.4.md '공통 계약', 문서/설계/ai규칙-v1.1.2.md '도우미·번역 규칙'
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  try {
    const result = await askHelper(body, await createHelperDeps());
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("helper/ask failed", error);
    return Response.json({ error: "helper_failed" }, { status: 502 });
  }
}
