import { parseSignupInput, signup, type SignupDeps } from "@/lib/auth/signup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST /api/auth/signup: 로그인 없이 부름. 가입 코드 확인과 계정 만들기는 service_role로 한다.
// 근거: 문서/설계/데이터구조-v1.6.6.md '공통 계약', 문서/결정/2026-10-25-로그인가입.md
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = parseSignupInput(body);
  if (!parsed.ok) return Response.json(parsed.response.body, { status: parsed.response.status });

  const admin = createSupabaseAdminClient();

  const deps: SignupDeps = {
    async findActiveCode(code) {
      const { data } = await admin
        .from("join_codes")
        .select("org_id, role, organizations(name, is_training)")
        .eq("code", code)
        .eq("active", true)
        .maybeSingle();
      if (!data) return null;
      const org = data.organizations as unknown as { name: string; is_training: boolean } | null;
      if (!org) return null;
      return {
        orgId: data.org_id,
        role: data.role,
        orgName: org.name,
        isTraining: org.is_training,
      };
    },
    async createConfirmedUser(email, password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // 확인 메일을 보내지 않음
      });
      if (data.user) return { ok: true, userId: data.user.id };
      if (error?.code === "email_exists" || error?.code === "user_already_exists") {
        return { ok: false, reason: "email_taken" };
      }
      if (error?.code === "weak_password") return { ok: false, reason: "weak_password" };
      if (error?.code === "email_address_invalid") return { ok: false, reason: "invalid_email" };
      return { ok: false, reason: "failed" };
    },
    async insertProfile(row) {
      const { error } = await admin.from("profiles").insert(row);
      return !error;
    },
    async deleteUser(userId) {
      await admin.auth.admin.deleteUser(userId);
    },
  };

  const result = await signup(parsed.input, deps);
  return Response.json(result.body, { status: result.status });
}
