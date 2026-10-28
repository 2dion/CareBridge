import { describe, expect, it } from "vitest";

import { checkAddedItem, parseAddedItem } from "./added-item";
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
