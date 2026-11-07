import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ language: "vi" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/demo/demo-provider", () => ({
  useDemo: () => null,
  useRoleNames: () => ({ worker: "작성자", reviewer: "관리자" }),
}));
vi.mock("./languages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./languages")>();
  return {
    ...actual,
    get DEFAULT_NATIVE_LANG() {
      return context.language;
    },
  };
});
import SignupPage from "../../app/(auth)/signup/page";

beforeEach(() => {
  context.language = "vi";
});

describe("A2 한국어 안내의 병기 구분점(#315)", () => {
  it("한국어를 고르면 번역과 함께 안내 끝 구분점도 숨긴다", () => {
    context.language = "ko";
    const html = renderToStaticMarkup(<SignupPage />);
    expect(html).not.toMatch(/class="native"[^>]*lang="vi"/);
    expect(html).not.toMatch(/(?:받은 코드|별명도 돼요\)|8자 이상)\s*·/);
  });
  it("베트남어 안내에는 구분점과 번역을 함께 유지한다", () => {
    const html = renderToStaticMarkup(<SignupPage />);
    expect(html).toContain('lang="vi"');
    expect(html).toMatch(/받은 코드\s*·/);
    expect(html).toMatch(/8자 이상\s*·/);
    expect(html).toContain("Tên hiển thị");
  });
  it.each(["zh", "mn", "en"])(
    "%s 미리보기에서도 안내 번역과 구분점을 함께 렌더링한다",
    (language) => {
      context.language = language;
      const html = renderToStaticMarkup(<SignupPage />);
      expect(html).toContain(`class="native" lang="${language}"`);
      expect(html).toMatch(/받은 코드\s*·/);
      expect(html).toMatch(/8자 이상\s*·/);
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("[object Object]");
    },
  );
});
