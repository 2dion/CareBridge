import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DemoDb } from "@/lib/demo/store";

// 이슈 #393: 볼 수 없는 기록의 /write·/voice는 '불러오는 중'에 멈추지 않고 /today로 간다.
// 이 저장소에는 DOM 렌더러(jsdom·react-test-renderer)가 없어, 이 파일에서만 useEffect를 렌더 중에 바로 실행하게
// 바꾸고 react-dom/server로 그린다. 페이지의 이동 effect가 부르는 router.replace를 본다.
const state = vi.hoisted(() => ({
  db: null as DemoDb | null,
  real: true,
  id: "",
  replace: vi.fn(),
}));

vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useEffect: (effect: () => void) => void effect() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: state.replace, back: vi.fn() }),
  useParams: () => ({ id: state.id }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/records",
}));
vi.mock("next/link", () => ({ default: (props: { children: unknown }) => props.children }));
vi.mock("@/lib/auth/session", () => ({ supabaseConfigured: () => true, signOut: vi.fn() }));
vi.mock("@/components/mobile/use-recorder", () => ({
  MAX_SECONDS: 600,
  clock: () => "00:00",
  useRecorder: () => ({
    state: "idle",
    seconds: 0,
    level: 0,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    discard: vi.fn(),
    blob: () => null,
  }),
}));
vi.mock("@/components/demo/demo-provider", async () => {
  const { roleNames } = await import("@/lib/demo/roles");
  return {
    nowIso: () => "2026-11-05T00:00:00Z",
    useRoleNames: () => roleNames(false),
    useDemo: () =>
      state.db && {
        db: state.db,
        today: "2026-11-05",
        update: vi.fn(),
        ...(state.real
          ? { real: { nativeLang: "vi", actions: {}, userId: "w1", role: "worker" } }
          : {}),
      },
  };
});

const { createDemoDb } = await import("@/lib/demo/store");
const pages = {
  write: (await import("@/app/(worker)/records/[id]/write/page")).default,
  voice: (await import("@/app/(worker)/records/[id]/voice/page")).default,
};

function setup(kind: "ok" | "noRecord" | "noResident" | "locked" | "loading", real = true) {
  const db = createDemoDb("2026-11-05");
  const record = Object.values(db.records).find((row) => row.status === "draft")!;
  state.id = record.id;
  state.real = real;
  state.db = db;
  if (kind === "noRecord") state.id = "missing-record";
  if (kind === "noResident") db.residents = db.residents.filter((r) => r.id !== record.residentId);
  if (kind === "locked") db.records[record.id] = { ...record, status: "submitted" };
  if (kind === "loading") state.db = null;
}

const render = (page: keyof typeof pages) => {
  const Page = pages[page];
  renderToStaticMarkup(<Page />);
};

beforeEach(() => state.replace.mockReset());

describe.each(["write", "voice"] as const)("%s 화면 이동(#393)", (page) => {
  it("기록이 없으면 /today", () => {
    setup("noRecord");
    render(page);
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/today");
  });

  it("어르신을 읽을 수 없으면 /today", () => {
    setup("noResident");
    render(page);
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/today");
  });

  it.each([true, false])("정상 기록이면 이동하지 않는다(실제 모드 %s)", (real) => {
    setup("ok", real);
    render(page);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("첫 로딩(demo 없음)에는 이동하지 않는다", () => {
    setup("loading");
    render(page);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("보낸 기록은 /today가 아니라 기록 보기로만 간다", () => {
    setup("locked");
    render(page);
    expect(state.replace).toHaveBeenCalledExactlyOnceWith(`/records/${state.id}/view`);
  });
});
