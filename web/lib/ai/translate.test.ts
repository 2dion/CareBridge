// 도우미 질문 번역 응답 읽기 (이슈 #219)
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseQuestionTranslation } = await import("./translate");

describe("parseQuestionTranslation", () => {
  it("번역문과 핵심 낱말을 꺼낸다", () => {
    expect(
      parseQuestionTranslation(
        '{"text":"어르신이 숨쉬기 힘들다고 해요","keywords":["호흡","호흡곤란"]}',
      ),
    ).toEqual({ text: "어르신이 숨쉬기 힘들다고 해요", keywords: ["호흡", "호흡곤란"] });
  });

  it("핵심 낱말이 없거나 형식이 틀려도 번역문은 받고, 빈 낱말·중복·너무 많은 낱말은 거른다", () => {
    expect(parseQuestionTranslation('{"text":"밥을 안 드셔요"}')).toEqual({
      text: "밥을 안 드셔요",
      keywords: [],
    });
    expect(
      parseQuestionTranslation(
        '{"text":"질문","keywords":["호흡","호흡"," ","a",3,"가나","다라","마바","사아","자차","카타"]}',
      )?.keywords,
    ).toEqual(["호흡", "가나", "다라", "마바", "사아", "자차"]);
  });

  it("번역문이 없거나 JSON이 아니면 null", () => {
    expect(parseQuestionTranslation('{"keywords":["호흡"]}')).toBeNull();
    expect(parseQuestionTranslation("번역 못 했어요")).toBeNull();
  });
});
