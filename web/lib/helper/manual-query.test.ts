// 도우미 교재 검색어: 조사를 뗀 낱말도 넣는다 (이슈 #183)
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { manualQuery } = await import("./ask-supabase");

describe("manualQuery", () => {
  it("'신체활동지원이 뭐예요?'에 조사를 뗀 '신체활동지원'이 들어간다", () => {
    const words = manualQuery("신체활동지원이 뭐예요?").split(" or ");
    expect(words).toContain("신체활동지원이");
    expect(words).toContain("신체활동지원");
  });

  it("'신체활동지원이란 무엇인가요?'도 '신체활동지원'으로 찾는다", () => {
    expect(manualQuery("신체활동지원이란 무엇인가요?").split(" or ")).toContain("신체활동지원");
  });

  it("조사를 떼면 한 글자가 되는 낱말은 넣지 않고, 같은 낱말은 한 번만 넣는다", () => {
    const words = manualQuery("밥을 식사 식사").split(" or ");
    expect(words).not.toContain("밥");
    expect(words.filter((word) => word === "식사")).toHaveLength(1);
  });
});
