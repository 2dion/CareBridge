import "server-only";

import { createClient } from "@supabase/supabase-js";

import { MissingEnvError } from "@/lib/errors";

// 로그인 전 가입(/api/auth/signup)처럼 RLS를 넘어야 하는 서버 작업에만 쓴다.
// SUPABASE_SERVICE_ROLE_KEY는 서버 환경 변수에만 두고 브라우저 코드에 넣지 않는다(AGENTS.md 원칙 6·7).
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new MissingEnvError("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new MissingEnvError("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
