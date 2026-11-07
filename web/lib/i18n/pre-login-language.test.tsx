import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/demo/demo-provider", () => ({
  useDemo: () => null,
  useRoleNames: () => ({ worker: "작성자", reviewer: "관리자" }),
}));
import LoginPage from "../../app/(auth)/login/page";
import SignupPage from "../../app/(auth)/signup/page";

// 로그인 전에는 그 사람의 언어를 모르므로 영어로 병기한다(결정 2026-11-07-로그인전영어병기)
describe("로그인 전 병기 언어", () => {
  it.each([
    ["A1(로그인)", LoginPage],
    ["A2(회원가입) 모국어를 고르기 전", SignupPage],
  ])("%s은 영어 줄만 보이고 베트남어 줄은 없다", (_name, Page) => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toMatch(/class="native"[^>]*lang="en"/);
    expect(html).not.toMatch(/class="native"[^>]*lang="vi"/);
    expect(html).not.toContain("undefined");
  });
});
