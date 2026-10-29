// 회원가입: 가입 코드가 기관·역할을 정하고, 서버가 계정과 profiles 1행을 함께 만든다.
// 근거: 문서/결정/2026-10-25-로그인가입.md, 문서/설계/데이터구조-v1.6.4.md '공통 계약' POST /api/auth/signup
// DB·Supabase Auth 호출은 SignupDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

export type Role = "worker" | "reviewer";
export type NativeLang = "ko" | "vi";

export type SignupInput = {
  code: string;
  email: string;
  password: string;
  name: string;
  nativeLang: NativeLang;
};

export type JoinCode = { orgId: string; role: Role; orgName: string; isTraining: boolean };

export type CreateUserResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "email_taken" | "weak_password" | "invalid_email" | "failed" };

export type SignupDeps = {
  findActiveCode(code: string): Promise<JoinCode | null>;
  createConfirmedUser(email: string, password: string): Promise<CreateUserResult>;
  insertProfile(row: {
    id: string;
    org_id: string;
    role: Role;
    name: string;
    native_lang: NativeLang;
  }): Promise<boolean>;
  deleteUser(userId: string): Promise<void>;
};

export type SignupError =
  | "invalid_input"
  | "invalid_code"
  | "email_taken"
  | "weak_password"
  | "invalid_email"
  | "signup_failed";

export type SignupResponse = {
  status: number;
  body:
    | { user_id: string; role: Role; org_name: string; is_training: boolean }
    | { error: SignupError };
};

export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (status: number, error: SignupError): SignupResponse => ({ status, body: { error } });

// 요청 본문을 읽어 형식을 본다. 공통 계약의 오류 키 4개에 없는 형식 오류(칸 빠짐 등)는 invalid_input.
export function parseSignupInput(
  body: unknown,
): { ok: true; input: SignupInput } | { ok: false; response: SignupResponse } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, response: fail(400, "invalid_input") };
  }
  const b = body as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const code = text(b.code).toUpperCase();
  const email = text(b.email).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const name = text(b.name);
  const nativeLang = b.native_lang;

  if (!name || (nativeLang !== "ko" && nativeLang !== "vi")) {
    return { ok: false, response: fail(400, "invalid_input") };
  }
  if (!code) return { ok: false, response: fail(404, "invalid_code") };
  if (!EMAIL_PATTERN.test(email)) return { ok: false, response: fail(400, "invalid_email") };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, response: fail(400, "weak_password") };
  }
  return { ok: true, input: { code, email, password, name, nativeLang } };
}

// ① 코드가 있고 active인지 ② 계정을 '이메일 확인됨'으로 만들고 ③ profiles 1행.
// ③이 실패하면 ②에서 만든 계정을 지워 반쪽 계정을 남기지 않는다.
export async function signup(input: SignupInput, deps: SignupDeps): Promise<SignupResponse> {
  const joinCode = await deps.findActiveCode(input.code);
  if (!joinCode) return fail(404, "invalid_code");

  const created = await deps.createConfirmedUser(input.email, input.password);
  if (!created.ok) {
    if (created.reason === "email_taken") return fail(409, "email_taken");
    if (created.reason === "weak_password") return fail(400, "weak_password");
    if (created.reason === "invalid_email") return fail(400, "invalid_email");
    return fail(500, "signup_failed");
  }

  const inserted = await deps.insertProfile({
    id: created.userId,
    org_id: joinCode.orgId,
    role: joinCode.role,
    name: input.name,
    // 관리자 코드면 ko로 저장 (공통 계약)
    native_lang: joinCode.role === "reviewer" ? "ko" : input.nativeLang,
  });
  if (!inserted) {
    await deps.deleteUser(created.userId);
    return fail(500, "signup_failed");
  }

  return {
    status: 201,
    body: {
      user_id: created.userId,
      role: joinCode.role,
      org_name: joinCode.orgName,
      is_training: joinCode.isTraining,
    },
  };
}
