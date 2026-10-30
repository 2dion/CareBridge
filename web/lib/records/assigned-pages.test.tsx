import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OverviewPage from "@/app/(reviewer)/overview/page";
import ReviewQueuePage from "@/app/(reviewer)/review/page";
import VoicePage from "@/app/(worker)/records/[id]/voice/page";
import RecordViewPage from "@/app/(worker)/records/[id]/view/page";
import { roleNames } from "@/lib/demo/roles";
import { createDemoDb, type DemoDb, returnedRecords } from "@/lib/demo/store";

const fixture = vi.hoisted(() => ({
  db: undefined as DemoDb | undefined,
  id: "",
  training: false,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: fixture.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/demo/demo-provider", () => ({
  useDemo: () => ({ db: fixture.db, today: "2026-10-30", real: null, update: vi.fn() }),
  useRoleNames: () => roleNames(fixture.training),
  nowIso: () => "2026-10-30T12:00:00+09:00",
}));

describe("배정된 FE 화면", () => {
  beforeEach(() => {
    fixture.db = createDemoDb("2026-10-30");
    fixture.id = returnedRecords(fixture.db)[0].id;
    fixture.training = false;
  });

  it("M0는 숫자 상자 네 개와 첫 메뉴를 보이며 표는 기본 본문에 없다", () => {
    const markup = renderToStaticMarkup(<OverviewPage />);
    expect(markup.match(/class="overview-tile/g)).toHaveLength(4);
    expect(markup).toContain("기록 현황");
    expect(markup).toContain("수정 요청 중");
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain('role="dialog"');
    expect(markup).toContain('href="/overview"');
  });

  it("교육용 기관 M0에는 연습용과 강사 메뉴가 유지된다", () => {
    fixture.training = true;
    const markup = renderToStaticMarkup(<OverviewPage />);
    expect(markup).toContain("연습용");
    expect(markup).toContain("강사");
    expect(markup).toContain("어르신·교육생");
  });

  it("검토 대기가 없으면 0인 보조 칩을 숨긴다", () => {
    fixture.db!.records = {};
    const markup = renderToStaticMarkup(<OverviewPage />);
    expect(markup).not.toContain("확인 필요 0");
    expect(markup).not.toContain("지연전송");
    expect(markup).not.toContain("재전송");
    expect(markup.match(/class="overview-tile/g)).toHaveLength(4);
  });

  it("M1에서는 현황 상자가 빠지고 검토 표만 남는다", () => {
    const markup = renderToStaticMarkup(<ReviewQueuePage />);
    expect(markup).toContain("<table");
    expect(markup).not.toContain('class="missed-box');
    expect(markup).toContain("받은 시각이 오래된 기록부터");
  });

  it("W2의 앱 안내 세 문장과 한 언어 안내가 병기된다", () => {
    const markup = renderToStaticMarkup(<VoicePage />);
    expect(markup).toContain("Khi sẵn sàng, hãy bắt đầu ghi âm.");
    expect(markup).toContain("Hãy kể thoải mái");
    expect(markup).toContain("AI tạo bản nháp theo từng mục");
    expect(markup).toContain("한국어나 모국어 중 하나로 말해 주세요.");
  });

  it("승인본 W4는 빈 항목을 펼칠 수 있게 보존한다", () => {
    const record = fixture.db!.records[fixture.id];
    record.status = "approved";
    record.items = record.items.map((item) =>
      item.item_key === "sleep"
        ? { ...item, status: "not_mentioned", value_ko: "" }
        : { ...item, status: "observed", value_ko: "내용" },
    );
    const markup = renderToStaticMarkup(<RecordViewPage />);
    expect(markup).toContain("언급 없음 항목 1개");
    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
    expect(markup.match(/<article/g)).toHaveLength(9);
  });
});
