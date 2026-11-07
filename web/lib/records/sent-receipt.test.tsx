// #374: 담당이 끝난 어르신의 기록을 전송하면(결정 #367) 재조회에서 기록이 빠진다.
// 그래도 W3 전송 완료 화면이 '불러오는 중'에 멈추지 않는지 본다(Codex 검토 R1).
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readSentReceipt, saveSentReceipt } from "./sent-receipt";

const state = vi.hoisted(() => ({ id: "", hidden: false, replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: state.id }),
  useRouter: () => ({ push: vi.fn(), replace: state.replace }),
  usePathname: () => "/today",
}));

vi.mock("@/components/demo/demo-provider", async () => {
  const { createDemoDb } = await import("@/lib/demo/store");
  const { roleNames } = await import("@/lib/demo/roles");
  const db = createDemoDb("2026-11-07");
  const record = Object.values(db.records).find((r) => r.draftState === "ready")!;
  state.id = record.id;
  return {
    useRoleNames: () => roleNames(false),
    useDemo: () => ({
      db: {
        ...db,
        // 담당이 끝나 명단에서 빠진 어르신
        residents: db.residents.filter((r) => r.id !== record.residentId),
        records: state.hidden ? {} : { [record.id]: { ...record, status: "submitted" } },
      },
      real: { nativeLang: "vi", role: "worker" },
    }),
  };
});

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { sessionStorage: fakeStorage() });
  state.hidden = false;
});
afterEach(() => vi.unstubAllGlobals());

async function render() {
  const { default: Page } = await import("@/app/(worker)/records/[id]/sent/page");
  return renderToStaticMarkup(<Page />);
}

describe("W3 전송 완료 · 기록이 권한에서 빠진 뒤 (#374)", () => {
  it("기록이 아직 보이면 기존 완료 화면을 그린다", async () => {
    const html = await render();
    expect(html).toContain("기록을 전송했어요!");
    expect(html).toContain("기록에서 보기");
  });

  it("기록이 빠져도 영수증이 있으면 완료를 알리고, 이름·기록 보기 버튼은 없다", async () => {
    saveSentReceipt(state.id, {
      careDate: "2026-11-05",
      firstSubmittedAt: "2026-11-07T02:00:00.000Z",
    });
    state.hidden = true;
    const html = await render();
    expect(html).toContain("기록을 전송했어요!");
    expect(html).not.toContain("불러오는 중");
    expect(html).not.toContain("담당이 끝난 어르신");
    expect(html).not.toContain("기록에서 보기");
    // 돌봄 날짜보다 2일 늦게 처음 전송
    expect(html).toContain("2일 늦게 전송");
  });

  it("기록도 영수증도 없으면 완료라고 말하지 않는다(오늘 화면으로 보냄)", async () => {
    state.hidden = true;
    const html = await render();
    expect(html).not.toContain("기록을 전송했어요!");
  });
});

describe("전송 영수증", () => {
  it("날짜·시각만 남기고, 깨진 값은 버린다", () => {
    saveSentReceipt("r1", { careDate: "2026-11-05", firstSubmittedAt: "2026-11-07T02:00:00.000Z" });
    expect(readSentReceipt("r1")).toEqual({
      careDate: "2026-11-05",
      firstSubmittedAt: "2026-11-07T02:00:00.000Z",
    });
    window.sessionStorage.setItem("carebridge.sent.r2", "{not json");
    expect(readSentReceipt("r2")).toBeNull();
    window.sessionStorage.setItem("carebridge.sent.r3", JSON.stringify({ careDate: "어제" }));
    expect(readSentReceipt("r3")).toBeNull();
  });

  it("저장소를 못 쓰면 조용히 넘어간다", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() =>
      saveSentReceipt("r1", { careDate: "2026-11-05", firstSubmittedAt: "x" }),
    ).not.toThrow();
    expect(readSentReceipt("r1")).toBeNull();
  });
});
