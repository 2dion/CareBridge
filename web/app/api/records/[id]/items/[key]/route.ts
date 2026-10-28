import { patchItem } from "@/lib/records/item-patch";
import { createItemPatchDeps } from "@/lib/records/item-patch-supabase";

// PATCH /api/records/:id/items/:key: 작성자(W3)·담당자(R2)가 항목 하나를 고침. value_ko가 바뀌면 그 항목만 다시 번역한다.
// 근거: 문서/설계/데이터구조-v1.6.2.md '공통 계약' PATCH 규칙, 문서/결정/2026-10-28-항목하나저장.md
export async function PATCH(request: Request, ctx: RouteContext<"/api/records/[id]/items/[key]">) {
  const { id, key } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await patchItem(id, key, body, await createItemPatchDeps());
  return Response.json(result.body, { status: result.status });
}
