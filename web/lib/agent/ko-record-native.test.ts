import { describe, expect, it } from "vitest";

import { checkAddedItem } from "./added-item";
import { ITEM_KEYS, type DraftItem, validateDraft } from "./validate-draft";

// 이슈 #336 끝난 기준 3: 기록 언어가 한국어(ko)면 AI가 모국어 칸을 채워 와도 서버가 비운다.
const transcript = "점심은 반 그릇 드셨어요. 밤에 자주 깨셨는데 몇 번인지는 모르겠어요.";

const blank = (key: (typeof ITEM_KEYS)[number]): DraftItem => ({
  item_key: key,
  value_ko: "",
  value_native: "",
  status: "not_mentioned",
  evidence: "",
  reason: "",
  reason_native: "",
  detail: {},
});

const meal: DraftItem = {
  ...blank("meal"),
  value_ko: "점심 절반 드심",
  value_native: "Ăn một nửa bữa trưa",
  status: "observed",
  evidence: "점심은 반 그릇 드셨어요",
  detail: { amount: "half_or_more" },
};
const sleep: DraftItem = {
  ...blank("sleep"),
  value_ko: "밤에 자주 깨심",
  value_native: "Thức dậy nhiều lần vào ban đêm",
  status: "needs_check",
  evidence: "밤에 자주 깨셨는데",
  reason: "깬 횟수 확인 필요",
  reason_native: "Cần kiểm tra số lần thức dậy",
};

function draft(): unknown {
  return {
    transcript_ko: transcript,
    items: ITEM_KEYS.map((key) => (key === "meal" ? meal : key === "sleep" ? sleep : blank(key))),
    form_fields: {},
  };
}

const ctx = (nativeLang?: "ko" | "vi" | "zh", blockedNames: string[] = []) => ({
  transcript,
  careType: "facility" as const,
  nativeLang,
  blockedNames,
});

const byKey = (items: DraftItem[] | undefined, key: string) =>
  items?.find((item) => item.item_key === key);

describe("validateDraft: ko 기록은 모국어 칸을 비움", () => {
  it("value_native·reason_native를 모두 빈칸으로, needs_check의 reason은 남긴다", () => {
    const result = validateDraft(draft(), ctx("ko"));
    expect(result.fixed).not.toBeNull();
    for (const item of result.fixed!.items) {
      expect(item.value_native).toBe("");
      expect(item.reason_native).toBe("");
    }
    expect(byKey(result.fixed!.items, "meal")?.value_ko).toBe("점심 절반 드심");
    const s = byKey(result.fixed!.items, "sleep");
    expect(s?.status).toBe("needs_check");
    expect(s?.reason).toContain("깬 횟수 확인 필요");
  });

  it.each([["vi"], [undefined]] as const)("nativeLang %s면 AI 번역을 그대로 둔다", (lang) => {
    const result = validateDraft(draft(), ctx(lang));
    expect(byKey(result.fixed!.items, "meal")?.value_native).toBe("Ăn một nửa bữa trưa");
    expect(byKey(result.fixed!.items, "sleep")?.reason_native).toContain(
      "Cần kiểm tra số lần thức dậy",
    );
  });

  it("zh 기록도 비우지 않는다", () => {
    const result = validateDraft(draft(), ctx("zh"));
    expect(byKey(result.fixed!.items, "meal")?.value_native).toBe("Ăn một nửa bữa trưa");
  });

  // run-agent의 자동 정리 중단은 ko면 빈칸으로 두므로, 같은 기준이면 이 칸도 비어야 한다.
  it("ko 기록에서 실명 검사가 낮춘 항목의 reason_native도 빈칸", () => {
    const named = {
      ...(draft() as { items: DraftItem[] }),
    };
    named.items = named.items.map((item) =>
      item.item_key === "meal" ? { ...item, value_ko: "김가상님 점심 절반 드심" } : item,
    );
    const result = validateDraft(named, ctx("ko", ["김가상"]));
    expect(byKey(result.fixed!.items, "meal")?.reason_native).toBe("");
  });
});

describe("checkAddedItem(고칠 내용 다시 정리): ko 기록", () => {
  const current = ITEM_KEYS.map(blank);

  it("ko면 AI가 채운 value_native·reason_native를 비운다", () => {
    const out = checkAddedItem(sleep, current, ctx("ko"), "밤에 자주 깨셨어요", {});
    expect(out?.value_ko).toBe("밤에 자주 깨심");
    expect(out?.value_native).toBe("");
    expect(out?.reason_native).toBe("");
    expect(out?.reason).toContain("깬 횟수 확인 필요");
  });

  it("vi면 번역을 그대로 둔다", () => {
    const out = checkAddedItem(meal, current, ctx("vi"), "점심은 반 그릇 드셨어요", {});
    expect(out?.value_native).toBe("Ăn một nửa bữa trưa");
  });
});
