import { describe, expect, it, vi } from "vitest";

import { parseSignupInput, signup, type JoinCode, type SignupDeps } from "./signup";

const body = {
  code: " abcd2345 ",
  email: " Mai@Example.TEST ",
  password: "password1",
  name: " 마이 ",
  native_lang: "vi",
};

const workerCode: JoinCode = {
  orgId: "org-1",
  role: "worker",
  orgName: "데모 요양센터",
  isTraining: false,
};

function fakeDeps(overrides: Partial<SignupDeps> = {}): SignupDeps {
  return {
    findActiveCode: vi.fn(async () => workerCode),
    createConfirmedUser: vi.fn(async () => ({ ok: true as const, userId: "user-1" })),
    insertProfile: vi.fn(async () => true),
    deleteUser: vi.fn(async () => {}),
    ...overrides,
  };
}

function input() {
  const parsed = parseSignupInput(body);
  if (!parsed.ok) throw new Error("parse failed");
  return parsed.input;
}

describe("parseSignupInput", () => {
  it("코드는 대문자, 이메일은 소문자, 앞뒤 공백 정리", () => {
    expect(input()).toEqual({
      code: "ABCD2345",
      email: "mai@example.test",
      password: "password1",
      name: "마이",
      nativeLang: "vi",
    });
  });

  it("이메일 형식이 틀리면 400 invalid_email", () => {
    const r = parseSignupInput({ ...body, email: "mai" });
    expect(r.ok || r.response).toEqual({ status: 400, body: { error: "invalid_email" } });
  });

  it("비밀번호가 8자보다 짧으면 400 weak_password", () => {
    const r = parseSignupInput({ ...body, password: "1234567" });
    expect(r.ok || r.response).toEqual({ status: 400, body: { error: "weak_password" } });
  });

  it("코드가 비면 404 invalid_code", () => {
    const r = parseSignupInput({ ...body, code: "  " });
    expect(r.ok || r.response).toEqual({ status: 404, body: { error: "invalid_code" } });
  });

  it("이름이 없거나 모국어가 ko·vi가 아니면 400 invalid_input", () => {
    for (const bad of [{ ...body, name: " " }, { ...body, native_lang: "en" }, null, "x"]) {
      const r = parseSignupInput(bad);
      expect(r.ok || r.response).toEqual({ status: 400, body: { error: "invalid_input" } });
    }
  });
});

describe("signup", () => {
  it("성공하면 201과 user_id·role·org_name·is_training", async () => {
    const deps = fakeDeps();
    const r = await signup(input(), deps);
    expect(r).toEqual({
      status: 201,
      body: { user_id: "user-1", role: "worker", org_name: "데모 요양센터", is_training: false },
    });
    expect(deps.insertProfile).toHaveBeenCalledWith({
      id: "user-1",
      org_id: "org-1",
      role: "worker",
      name: "마이",
      native_lang: "vi",
    });
  });

  it("틀리거나 꺼진 코드면 404 invalid_code, 계정을 만들지 않음", async () => {
    const deps = fakeDeps({ findActiveCode: vi.fn(async () => null) });
    expect(await signup(input(), deps)).toEqual({ status: 404, body: { error: "invalid_code" } });
    expect(deps.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("이미 있는 이메일이면 409 email_taken", async () => {
    const deps = fakeDeps({
      createConfirmedUser: vi.fn(async () => ({
        ok: false as const,
        reason: "email_taken" as const,
      })),
    });
    expect(await signup(input(), deps)).toEqual({ status: 409, body: { error: "email_taken" } });
  });

  it("Supabase가 약한 비밀번호로 거절하면 400 weak_password", async () => {
    const deps = fakeDeps({
      createConfirmedUser: vi.fn(async () => ({
        ok: false as const,
        reason: "weak_password" as const,
      })),
    });
    expect(await signup(input(), deps)).toEqual({ status: 400, body: { error: "weak_password" } });
  });

  it("profiles를 넣다 실패하면 만든 계정을 지움", async () => {
    const deps = fakeDeps({ insertProfile: vi.fn(async () => false) });
    expect(await signup(input(), deps)).toEqual({ status: 500, body: { error: "signup_failed" } });
    expect(deps.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("담당자 코드면 모국어를 ko로 저장", async () => {
    const deps = fakeDeps({
      findActiveCode: vi.fn(async () => ({ ...workerCode, role: "reviewer" as const })),
    });
    await signup(input(), deps);
    expect(deps.insertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ role: "reviewer", native_lang: "ko" }),
    );
  });
});
