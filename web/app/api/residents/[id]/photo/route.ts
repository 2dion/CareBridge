import { changePhoto, getPhoto } from "@/lib/residents/photo-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, ctx: RouteContext<"/api/residents/[id]/photo">) {
  return getPhoto(await createSupabaseServerClient(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: RouteContext<"/api/residents/[id]/photo">) {
  return changePhoto(
    await createSupabaseServerClient(),
    createSupabaseAdminClient,
    (await ctx.params).id,
    request,
  );
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/residents/[id]/photo">) {
  return changePhoto(
    await createSupabaseServerClient(),
    createSupabaseAdminClient,
    (await ctx.params).id,
    request,
    true,
  );
}
