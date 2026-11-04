import { deleteResident } from "@/lib/residents/delete-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// M4 어르신 삭제(관리자, 이슈 #103). 기록이 하나라도 있으면 409 has_records
export async function DELETE(request: Request, ctx: RouteContext<"/api/residents/[id]">) {
  return deleteResident(
    await createSupabaseServerClient(),
    createSupabaseAdminClient,
    (await ctx.params).id,
    request,
  );
}
