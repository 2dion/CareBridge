// 로그인·로그아웃(화면 v1.3 A1, 로그인가입 결정). Supabase 설정이 있으면 Supabase 로그인,
// 없으면(Mock 개발 환경) 브라우저에만 남는 시연 로그인. 비밀번호는 어디에도 저장하지 않는다.
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import type { Role } from "./signup";

export const MOCK_SESSION_KEY = "carebridge-demo-session";

export type SignInResult =
  | { ok: true; role: Role; onboarded: boolean }
  | { ok: false; reason: "wrong" | "no_profile" | "network" };

export function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** Mock 로그인: 이메일이 reviewer로 시작하면 관리자, 그 밖은 작성자. 비밀번호는 8자 이상만 본다. */
export function mockRole(email: string): Role {
  return email.trim().toLowerCase().startsWith("reviewer") ? "reviewer" : "worker";
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return { ok: false, reason: "network" };
  if (!supabaseConfigured()) {
    if (password.length < 8) return { ok: false, reason: "wrong" };
    const role = mockRole(email);
    try {
      window.localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ email, role }));
    } catch {
      /* 저장이 막혀도 이 화면에서는 들어간다 */
    }
    return { ok: true, role, onboarded: false };
  }
  const supabase = createSupabaseBrowserClient();
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, reason: "wrong" };
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, onboarded")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile) {
      await supabase.auth.signOut();
      return { ok: false, reason: "no_profile" };
    }
    return { ok: true, role: profile.role as Role, onboarded: Boolean(profile.onboarded) };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function signOut() {
  try {
    window.localStorage.removeItem(MOCK_SESSION_KEY);
  } catch {
    /* 무시 */
  }
  if (supabaseConfigured()) {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      /* 연결이 끊겨도 화면은 로그인으로 보낸다 */
    }
  }
}
