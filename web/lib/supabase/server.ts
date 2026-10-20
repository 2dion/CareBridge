import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { MissingEnvError } from "@/lib/errors";

// 서버 컴포넌트·Route Handler에서 로그인한 사람의 권한(RLS)으로 Supabase를 부른다.
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new MissingEnvError("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new MissingEnvError("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 로그인 갱신은 proxy가 맡는다(로그인 구현 때).
        }
      },
    },
  });
}
