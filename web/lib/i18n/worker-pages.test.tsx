import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  language: "vi",
  recordId: "",
  residentId: "",
  status: "" as "" | "submitted" | "approved",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: context.recordId, residentId: context.residentId, key: "meal" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/today",
}));
vi.mock("@/lib/auth/session", () => ({
  supabaseConfigured: () => true,
  signOut: vi.fn(),
}));
vi.mock("@/components/demo/demo-provider", async () => {
  const { createDemoDb } = await import("@/lib/demo/store");
  const { roleNames } = await import("@/lib/demo/roles");
  const db = createDemoDb("2026-11-05");
  const record = Object.values(db.records).find((row) => row.draftState === "ready")!;
  context.recordId = record.id;
  context.residentId = record.residentId;
  return {
    nowIso: () => "2026-11-05T00:00:00Z",
    useRoleNames: () => roleNames(false),
    useDemo: () => ({
      db: context.status
        ? {
            ...db,
            records: {
              ...db.records,
              [context.recordId]: { ...db.records[context.recordId], status: context.status },
            },
          }
        : db,
      today: "2026-11-05",
      update: vi.fn(),
      real: {
        nativeLang: context.language,
        actions: {},
        userId: "synthetic-worker",
        role: "worker",
      },
    }),
  };
});

const paths = [
  "guide",
  "today",
  "archive",
  "start/[residentId]",
  "records/[id]",
  "records/[id]/items/[key]",
  "records/[id]/voice",
  "records/[id]/write",
  "records/[id]/sent",
  "records/[id]/view",
  "helper",
  "helper/history",
  "me",
  "me/font",
  "me/privacy",
  "me/ai",
] as const;
const pages = {
  guide: () => import("../../app/(worker)/guide/page"),
  today: () => import("../../app/(worker)/today/page"),
  archive: () => import("../../app/(worker)/archive/page"),
  "start/[residentId]": () => import("../../app/(worker)/start/[residentId]/page"),
  "records/[id]": () => import("../../app/(worker)/records/[id]/page"),
  "records/[id]/items/[key]": () => import("../../app/(worker)/records/[id]/items/[key]/page"),
  "records/[id]/voice": () => import("../../app/(worker)/records/[id]/voice/page"),
  "records/[id]/write": () => import("../../app/(worker)/records/[id]/write/page"),
  "records/[id]/sent": () => import("../../app/(worker)/records/[id]/sent/page"),
  "records/[id]/view": () => import("../../app/(worker)/records/[id]/view/page"),
  helper: () => import("../../app/(worker)/helper/page"),
  "helper/history": () => import("../../app/(worker)/helper/history/page"),
  me: () => import("../../app/(worker)/me/page"),
  "me/font": () => import("../../app/(worker)/me/font/page"),
  "me/privacy": () => import("../../app/(worker)/me/privacy/page"),
  "me/ai": () => import("../../app/(worker)/me/ai/page"),
};

beforeEach(() => {
  context.language = "vi";
  context.status = "";
});

describe("작성자 화면 병기 렌더링(#258)", () => {
  it.each(["submitted", "approved"] as const)(
    "기록 보기 %s 상태에서도 한국어 계정의 병기 줄을 숨긴다",
    async (status) => {
      context.status = status;
      const { default: Page } = await pages["records/[id]/view"]();
      expect(renderToStaticMarkup(<Page />)).toContain('lang="vi"');
      context.language = "ko";
      expect(renderToStaticMarkup(<Page />)).not.toContain('lang="vi"');
    },
  );
  it.each(paths)("%s: 베트남어 줄과 언어 속성을 유지하고 ko 계정에서는 숨긴다", async (path) => {
    const { default: Page } = await pages[path]();
    const bilingual = renderToStaticMarkup(<Page />);
    expect(bilingual).toContain('lang="vi"');
    context.language = "ko";
    const korean = renderToStaticMarkup(<Page />);
    expect(korean).not.toContain('lang="vi"');
    expect(korean).not.toContain('class="vi"');
  });
});
