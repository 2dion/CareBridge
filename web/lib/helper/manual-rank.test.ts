// 도우미 교재 검색 순위 (이슈 #219, 조사 처리는 #183)
import { describe, expect, it } from "vitest";

import type { ManualSection } from "./ask";
import { excerptSection, queryTerms, rankSections } from "./manual-rank";

const make = (title: string, body: string, page = "1"): ManualSection => ({
  chapter: "14장",
  title,
  page,
  body,
});

// 어르신·보고처럼 모든 절에 나오는 말과, 한 절에만 나오는 말(호흡·질식)을 섞는다
const SECTIONS = [
  make("업무보고", "어르신의 상태를 시설장에게 보고한다. 어떻게 기록하는지 알려 준다.", "352"),
  make("요양보호 기록 방법", "어르신의 하루를 기록한다. 어르신이 어떻게 지냈는지 쓴다.", "324"),
  make("식사 돕기", "어르신이 식사를 거부하시면 어떻게 해야 하는지 알려 준다.", "375"),
  make("질식", "호흡이 막히면 즉시 119에 신고한다. 숨을 쉬지 못하면 하임리히법을 한다.", "701"),
  make("신체활동지원", "신체활동지원은 씻기·식사·이동을 돕는 일이다.", "88"),
];

describe("queryTerms", () => {
  it("조사를 뗀 낱말을 함께 넣고, 흔한 질문 말은 뺀다", () => {
    const terms = queryTerms("신체활동지원이 어떻게 해야 하나요");
    expect(terms).toContain("신체활동지원이");
    expect(terms).toContain("신체활동지원");
    expect(terms).not.toContain("어떻게");
    expect(terms).not.toContain("해야");
    expect(terms).not.toContain("하나요");
  });

  it("한 글자가 되는 낱말은 넣지 않고 같은 낱말은 한 번만 넣는다", () => {
    const terms = queryTerms("밥을 식사 식사");
    expect(terms).not.toContain("밥");
    expect(terms.filter((term) => term === "식사")).toHaveLength(1);
  });
});

describe("rankSections", () => {
  it("흔한 말('어르신'·'어떻게')이 많은 절보다 질문의 핵심 낱말이 든 절이 앞선다", () => {
    const ranked = rankSections(SECTIONS, "어르신이 질식 어떻게 해야 하나요");
    expect(ranked[0].title).toBe("질식");
  });

  it("번역문에 교재 낱말이 없어도 핵심 낱말(keywords)로 절을 찾는다(이슈 #219)", () => {
    const question = "어르신이 숨쉬기 힘들다고 하세요 어떻게 해야 하나요";
    // 핵심 낱말 없이는 '숨쉬기'가 교재에 없어 흔한 말이 든 절만 나온다
    expect(rankSections(SECTIONS, question).map((s) => s.title)).not.toContain("질식");
    expect(rankSections(SECTIONS, question, ["호흡", "숨"])[0].title).toBe("질식");
  });

  it("'신체활동지원이 뭐예요?'처럼 조사가 붙어도 찾는다(이슈 #183)", () => {
    expect(rankSections(SECTIONS, "신체활동지원이 뭐예요?")[0].title).toBe("신체활동지원");
  });

  it("맞는 절이 없으면 빈 배열, 많으면 limit개만 돌려준다", () => {
    expect(rankSections(SECTIONS, "전혀 없는낱말입니다")).toEqual([]);
    expect(rankSections(SECTIONS, "어르신", [], 2)).toHaveLength(2);
  });
});

describe("점수 낮은 절 빼기(이슈 #229)", () => {
  it("1위 점수의 1/3 미만인 절은 돌려주지 않는다", () => {
    // '질식'은 그 절에만 있어 점수가 높고, '어르신'은 모든 절에 있어 점수가 낮다
    const ranked = rankSections(SECTIONS, "어르신이 질식 어떻게 해야 하나요", [], 5);
    expect(ranked[0].title).toBe("질식");
    expect(ranked.length).toBeLessThan(5);
    expect(ranked.map((s) => s.title)).not.toContain("업무보고");
  });
});

describe("excerptSection", () => {
  const body = ["하나", "둘 식사 거부", "셋", "넷", "다섯"].join("\n");

  it("맞는 문단과 앞뒤 문단만 남기고 뺀 자리는 '…'", () => {
    expect(excerptSection(body, ["식사"])).toBe("하나\n둘 식사 거부\n셋\n…");
    expect(excerptSection(["하나", "둘", "셋 낙상", "넷"].join("\n"), ["낙상"])).toBe(
      "…둘\n셋 낙상\n넷",
    );
  });

  it("맞는 문단이 없으면 앞부분, 상한을 넘지 않는다", () => {
    expect(excerptSection(body, ["없는말"])).toBe(body);
    const out = excerptSection("가".repeat(100), ["없는말"], 10);
    expect(Array.from(out)).toHaveLength(10);
    const fit = excerptSection(
      ["짧은 문단", "식사 문단", "가".repeat(100)].join("\n"),
      ["식사"],
      20,
    );
    expect(Array.from(fit).length).toBeLessThanOrEqual(20);
    expect(fit).toContain("식사 문단");
  });

  it("대소문자가 달라도 찾는다", () => {
    expect(excerptSection("Intro\nHeimlich 방법\nEnd", ["heimlich"])).toContain("Heimlich 방법");
  });
});
