import { addItemByText } from "@/lib/audio/audio-service";
import { ITEM_KEYS, type ItemKey } from "@/lib/agent/validate-draft";
import { patchItem } from "@/lib/records/item-patch";
import { createItemPatchDeps } from "@/lib/records/item-patch-supabase";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 120; // Claude 항목 다시 쓰기(형식이 틀리면 한 번 더)

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// PATCH /api/records/:id/items/:key: 작성자(W3)·관리자(M2)가 항목 하나를 고침. value_ko가 바뀌면 그 항목만 다시 번역한다.
// 근거: 문서/설계/데이터구조-v1.6.3.md '공통 계약' PATCH 규칙, 문서/결정/2026-10-28-항목하나저장.md
export async function PATCH(request: Request, ctx: RouteContext<"/api/records/[id]/items/[key]">) {
  const { id, key } = await ctx.params;
  const result = await patchItem(id, key, await readJson(request), await createItemPatchDeps());
  return Response.json(result.body, { status: result.status });
}

// POST /api/records/:id/items/:key { text }: 작성자(W3)가 글로 쓴 고칠 내용으로 그 항목만 AI가 다시 쓴다.
// 음성 항목 보태기(③)와 같은 길이라 한국어·베트남어 어느 쪽으로 써도 한국어 기록체 + 모국어 번역이 된다(이슈 #118).
export async function POST(request: Request, ctx: RouteContext<"/api/records/[id]/items/[key]">) {
  const { id, key } = await ctx.params;
  if (!ITEM_KEYS.includes(key as ItemKey)) {
    return Response.json({ error: "invalid_item" }, { status: 400 });
  }
  const result = await addItemByText(
    await createSupabaseServerClient(),
    createSupabaseAdminClient(),
    id,
    key as ItemKey,
    await readJson(request),
  );
  return Response.json(result.body, { status: result.status });
}
