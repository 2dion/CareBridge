import { describe, expect, it } from "vitest";

import { addItemSystemPrompt, checkAddedItem, parseAddedItem } from "./added-item";
import { ITEM_KEYS, type DraftItem } from "./validate-draft";

const items: DraftItem[] = ITEM_KEYS.map((key) => ({
  item_key: key,
  value_ko: "",
  value_native: "",
  status: "not_mentioned",
  evidence: "",
  reason: "",
  reason_native: "",
  detail: {},
}));
const context = {
  transcript: "아침에 세수해 드렸어요.",
  careType: "facility" as const,
  nativeLang: "vi" as const,
  blockedNames: [],
};

describe("parseAddedItem", () => {
  it("JSON 한 개를 꺼내 항목으로 만듦", () => {
    const raw =
      '설명 {"value_ko":"점심 절반 드심","status":"observed","evidence":"점심 반 드셨어요"}';
    expect(parseAddedItem(raw, "meal")).toMatchObject({
      item_key: "meal",
      value_ko: "점심 절반 드심",
      status: "observed",
      detail: {},
    });
  });

  it("JSON이 아니면 null", () => {
    expect(parseAddedItem("모르겠어요", "meal")).toBeNull();
  });
});

describe("checkAddedItem", () => {
  it("새로 말한 글에 있는 근거는 통과", () => {
    const item = {
      ...items[2],
      value_ko: "점심 절반 드심",
      status: "observed" as const,
      evidence: "점심 반 드셨어요",
    };
    const checked = checkAddedItem(item, items, context, "점심 반 드셨어요", {});
    expect(checked).toMatchObject({ status: "observed", value_ko: "점심 절반 드심" });
  });

  it("어디에도 없는 근거는 '확인 필요'로 낮춤", () => {
    const item = {
      ...items[2],
      value_ko: "점심 다 드심",
      status: "observed" as const,
      evidence: "점심을 모두 드셨습니다",
    };
    const checked = checkAddedItem(item, items, context, "점심 반 드셨어요", {});
    expect(checked?.status).toBe("needs_check");
  });
});

describe("모국어로 고친 내용 (이슈 #118)", () => {
  it("value_ko에 베트남어를 그대로 넣으면 형식 오류(null)로 보고 다시 부르게 함", () => {
    const item = {
      ...items[2],
      value_ko: "Bác ăn được một nửa bữa trưa.",
      status: "observed" as const,
      evidence: "Bác ăn được một nửa bữa trưa.",
    };
    expect(checkAddedItem(item, items, context, "Bác ăn được một nửa bữa trưa.", {})).toBeNull();
  });

  it("베트남어로 말해도 value_ko가 한국어 기록체면 통과", () => {
    const item = {
      ...items[2],
      value_ko: "점심 절반 드심",
      value_native: "Ăn được một nửa bữa trưa",
      status: "observed" as const,
      evidence: "Bác ăn được một nửa bữa trưa.",
    };
    const checked = checkAddedItem(item, items, context, "Bác ăn được một nửa bữa trưa.", {});
    expect(checked).toMatchObject({ status: "observed", value_ko: "점심 절반 드심" });
  });

  it("프롬프트에 '한국어 기록체로 옮김'과 '풀린 이유는 다시 쓰지 않음' 규칙이 있음", () => {
    const prompt = addItemSystemPrompt("sleep", "vi");
    expect(prompt).toContain("value_ko는 반드시 한국어 기록체로 옮긴다");
    expect(prompt).toContain("그 이유를 다시 쓰지 않는다");
  });
});
