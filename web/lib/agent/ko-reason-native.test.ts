import { describe, expect, it } from "vitest";

import { supportMinutesPatch, type SupportCheckTarget } from "@/lib/records/support-check";

import { REASONS, reasonTranslation } from "./reasons";
import { allNeedsCheckDraft, ITEM_KEYS, type DraftItem, validateDraft } from "./validate-draft";

// 이슈 #336: 한국어(ko) 기록은 서버가 붙이는 코드 이유도 모국어 칸(reason_native)을 비운다.
const EXCEED = { physical: 80, emotional: 60, housework: 60 }; // 200분 > 방문 180분

function target(
  nativeLang: SupportCheckTarget["nativeLang"],
  reason_native = "",
): SupportCheckTarget {
  return {
    careType: "home",
    nativeLang,
    visitMinutes: 180,
    support: {
      value_ko: "목욕, 청소·빨래, 말벗·격려 제공하였음.",
      status: "observed",
      reason: "",
      reason_native,
      detail: { minutes: EXCEED },
    },
  };
}

describe("supportMinutesPatch(제공 지원 재검사) ko 기록", () => {
  it("방문 시간을 넘으면 확인 필요와 한국어 이유, reason_native는 빈칸", () => {
    const patch = supportMinutesPatch(target("ko"));
    expect(patch?.status).toBe("needs_check");
    expect(patch?.reason).toContain(REASONS.supportMinutesExceed);
    expect(patch?.reason_native).toBe("");
  });

  it("vi 기록은 모국어 이유를 붙인다", () => {
    expect(supportMinutesPatch(target("vi"))?.reason_native).not.toBe("");
  });

  it("남아 있던 모국어 이유가 있어도 빈 번역 때문에 '; '가 붙지 않는다", () => {
    expect(supportMinutesPatch(target("ko", "작성자 메모"))?.reason_native).toBe("작성자 메모");
  });

  it("예전 ko 기록에 남은 한국어 복사본 이유는 재검사 때 걷어 낸다", () => {
    const old = target("ko", `${REASONS.supportMinutesExceed} (200분 > 180분)`);
    expect(supportMinutesPatch(old)?.reason_native).toBe("");
  });
});

describe("allNeedsCheckDraft ko 기록", () => {
  it("9개 모두 reason은 한국어, reason_native는 빈칸", () => {
    const draft = allNeedsCheckDraft(REASONS.noReason, "", "ko");
    expect(draft.items).toHaveLength(9);
    for (const item of draft.items) {
      expect(item.reason).toBe(REASONS.noReason);
      expect(item.reason_native).toBe("");
    }
  });

  it("vi 기록은 고정 번역을 넣는다", () => {
    const draft = allNeedsCheckDraft(REASONS.noReason, "", "vi");
    expect(draft.items[0].reason_native).toBe(reasonTranslation(REASONS.noReason, "vi"));
    expect(draft.items[0].reason_native).not.toBe("");
  });
});

describe("validateDraft의 서버 이유 ko 기록", () => {
  const transcript = "밤에 자주 깨셨어요.";
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
  const draftWith = (item: DraftItem) => ({
    transcript_ko: transcript,
    items: ITEM_KEYS.map((key) => (key === item.item_key ? item : blank(key))),
    form_fields: {},
  });
  const ctx = (nativeLang: "ko" | "vi") => ({
    transcript,
    careType: "facility" as const,
    nativeLang,
    blockedNames: [],
  });

  it("이유 없는 확인 필요(noReason)는 ko면 reason_native 빈칸", () => {
    const item: DraftItem = {
      ...blank("sleep"),
      value_ko: "밤에 자주 깨심",
      status: "needs_check",
      evidence: "밤에 자주 깨셨어요",
    };
    const ko = validateDraft(draftWith(item), ctx("ko")).fixed!.items.find(
      (i) => i.item_key === "sleep",
    )!;
    expect(ko.reason).toBe(REASONS.noReason);
    expect(ko.reason_native).toBe("");
    const vi = validateDraft(draftWith(item), ctx("vi")).fixed!.items.find(
      (i) => i.item_key === "sleep",
    )!;
    expect(vi.reason_native).not.toBe("");
  });

  it("내용에 확인 요청 문장(questionInValue)이 있으면 ko면 reason_native 빈칸", () => {
    const item: DraftItem = {
      ...blank("sleep"),
      value_ko: "밤에 자주 깨심. 확인 필요",
      status: "observed",
      evidence: "밤에 자주 깨셨어요",
    };
    const out = validateDraft(draftWith(item), ctx("ko")).fixed!.items.find(
      (i) => i.item_key === "sleep",
    )!;
    expect(out.status).toBe("needs_check");
    expect(out.reason).not.toBe("");
    expect(out.reason_native).toBe("");
  });
});
