import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PHOTO_BUCKET } from "./photo";

// M4 어르신 삭제(이슈 #103): 잘못 더한 어르신을 지우는 용도라 기록이 하나도 없을 때만 지운다.
// 기록은 공식 기록이라 어르신을 지워도 남아야 하므로, 기록이 있으면 409 has_records(DB 외래 키도 막는다).
// 지우기는 관리자 RLS(residents_reviewer_delete)로 하고, 담당 연결·기록 없음 처리 줄은 DB가 같이 지운다(on delete cascade).
// 사진 파일은 행을 지운 뒤 서버 키로 정리한다(Storage 쓰기·삭제는 서버만, 이슈 #99).

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function deleteResident(
  client: SupabaseClient,
  admin: () => SupabaseClient,
  id: string,
  request: Request,
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail(403, "reviewer_only");
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return fail(401, "not_signed_in");
  const { data: me } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (me?.role !== "reviewer") return fail(403, "reviewer_only");

  const { data: resident, error: readError } = await client
    .from("residents")
    .select("id, org_id, photo_path")
    .eq("id", id)
    .maybeSingle();
  if (readError) return fail(500, "delete_failed");
  if (!resident) return fail(404, "resident_not_found");

  // 관리자는 같은 기관 기록을 모두 읽는다(records_select). 상태와 관계없이 한 건이라도 있으면 막는다
  const { count, error: countError } = await client
    .from("records")
    .select("id", { count: "exact", head: true })
    .eq("resident_id", id);
  if (countError) return fail(500, "delete_failed");
  if ((count ?? 0) > 0) return fail(409, "has_records");

  const { data: deleted, error } = await client
    .from("residents")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  // 그 사이 기록이 생기면 외래 키(23503)가 막는다
  if (error)
    return fail(
      error.code === "23503" ? 409 : 500,
      error.code === "23503" ? "has_records" : "delete_failed",
    );
  if (!deleted) return fail(404, "resident_not_found");

  const path = (resident as { photo_path: string | null }).photo_path;
  const cleanup = path ? await admin().storage.from(PHOTO_BUCKET).remove([path]) : null;
  return Response.json({ ok: true, cleanup_pending: Boolean(cleanup?.error) });
}
