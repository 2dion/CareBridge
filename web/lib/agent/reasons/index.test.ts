import { describe, expect, it } from "vitest";

import type { NativeLang } from "@/lib/i18n/languages";
import { nativeReasonForms, REASONS, REASONS_NATIVE, reasonTranslation } from "./index";

describe("코드 이유의 모국어 번역(REASONS_NATIVE)", () => {
  it.each(["vi", "zh", "mn", "en"] as const)("%s 표는 코드 이유를 모두 덮는다", (lang) => {
    const table = REASONS_NATIVE[lang]!;
    for (const reason of Object.values(REASONS)) {
      expect(table[reason], reason).toBeTruthy();
    }
    expect(Object.keys(table)).toHaveLength(Object.keys(REASONS).length);
  });

  it("중국어·영어도 숫자가 붙은 이유를 번역한다", () => {
    const reason = `${REASONS.supportMinutesExceed} (200분 > 180분)`;
    expect(reasonTranslation(reason, "zh")).toBe("各项协助时间合计超过访问时间 (200분 > 180분)");
    expect(reasonTranslation(reason, "en")).toBe(
      "The total support time is longer than the visit time (200분 > 180분)",
    );
  });

  it("숫자가 붙은 이유는 앞부분으로 찾고 뒤를 그대로 붙인다", () => {
    expect(reasonTranslation(`${REASONS.supportMinutesExceed} (200분 > 180분)`, "vi")).toBe(
      "Tổng thời gian hỗ trợ dài hơn thời gian thăm (200분 > 180분)",
    );
  });

  it("ko는 한국어 이유 그대로, 모르는 이유는 빈칸", () => {
    expect(reasonTranslation(REASONS.realName, "ko")).toBe(REASONS.realName);
    expect(reasonTranslation("모르는 이유", "vi")).toBe("");
  });

  it("고정문이 없는 언어는 reason_native를 빈칸으로 둔다(이슈 #259 끝난 기준)", () => {
    // 언어 목록에 더했지만 아직 고정문 파일이 없는 경우를 흉내 낸다
    const unknown = "xx" as NativeLang;
    expect(reasonTranslation(REASONS.realName, unknown)).toBe("");
    expect(reasonTranslation(`${REASONS.supportMinutesExceed} (200분 > 180분)`, unknown)).toBe("");
  });

  it("nativeReasonForms는 모든 언어의 고정문을 모은다", () => {
    const forms = nativeReasonForms([REASONS.supportMinutesExceed, "없는 이유"]);
    expect(forms).toContain("Tổng thời gian hỗ trợ dài hơn thời gian thăm");
    expect(forms).toContain("各项协助时间合计超过访问时间");
    expect(forms).toHaveLength(4);
  });
});
