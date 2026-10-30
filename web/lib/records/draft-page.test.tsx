import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DraftPage from "@/app/(worker)/records/[id]/page";
import ItemEditPage from "@/app/(worker)/records/[id]/items/[key]/page";
import { createDemoDb, type DemoDb, returnedRecords } from "@/lib/demo/store";

const fixture = vi.hoisted(() => ({
  db: undefined as DemoDb | undefined,
  id: "",
  pending: null as string | null,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: fixture.id, key: "meal" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/demo/demo-provider", () => ({
  useDemo: () => ({ db: fixture.db, today: "2026-10-30", real: null, update: vi.fn() }),
  useRoleNames: () => ({ reviewer: "관리자", reviewerVi: "người quản lý" }),
  nowIso: () => "2026-10-30T10:00:00+09:00",
}));
vi.mock("@/components/mobile/use-action-lock", () => ({
  useActionLock: () => ({ pending: fixture.pending, run: vi.fn() }),
}));

describe("W3 카드와 요청 중 화면", () => {
  beforeEach(() => {
    fixture.db = createDemoDb("2026-10-30");
    const record = returnedRecords(fixture.db)[0];
    fixture.id = record.id;
    record.returnReason = "[식사, 수면] 내용을 다시 봐 주세요.";
    record.items = record.items.map((item) => ({ ...item, confirmed_by_worker: true }));
    fixture.pending = null;
  });

  it("확인 완료인 수정 요청 카드도 배지를 붙이고 완료 수는 9개로 유지한다", () => {
    const markup = renderToStaticMarkup(<DraftPage />);
    expect(markup.match(/>수정 요청<\/span>/g)).toHaveLength(2);
    expect(markup.match(/<article/g)).toHaveLength(9);
    expect(markup).toContain("9개 모두 봤어요");
    expect(markup.indexOf("수정 요청 항목")).toBeLessThan(markup.indexOf("확인 완료 항목"));
  });

  it("확인 요청을 기다리는 동안 안내와 눌림 상태를 보이고 다른 저장을 막는다", () => {
    const record = fixture.db!.records[fixture.id];
    record.items = record.items.map((item) => ({ ...item, confirmed_by_worker: false }));
    fixture.pending = "confirm:meal";
    const markup = renderToStaticMarkup(<DraftPage />);
    expect(markup).toContain("확인 중");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("처리 중이에요. 잠시만 기다려 주세요.");
    expect(markup).toMatch(/disabled=""[^>]*>[\s\S]*?관리자에게 전송/);
    expect(markup).toContain('aria-disabled="true"');
  });

  it("항목 저장을 기다리는 동안 글 입력과 말하기를 잠그고 저장 중으로 표시한다", () => {
    fixture.pending = "apply";
    const markup = renderToStaticMarkup(<ItemEditPage />);
    expect(markup).toContain("저장 중");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toMatch(/<textarea[^>]*disabled=""/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?처리 중/);
  });
});
