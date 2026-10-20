import { createBrowserClient } from "@supabase/ssr";

// 브라우저에서 쓰는 Supabase 클라이언트. 공개 키(publishable)만 쓰고, RLS가 권한을 막는다.
// 비밀 키(service role / secret)는 브라우저 코드에 절대 넣지 않는다(AGENTS.md 원칙 6·7).
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
