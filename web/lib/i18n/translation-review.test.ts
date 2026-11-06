import { beforeEach, describe, expect, it, vi } from "vitest";

import { addItemSystemPrompt } from "@/lib/agent/added-item";
import { nativeReasonForms, REASONS } from "@/lib/agent/reasons";
import { agentSystemPrompt } from "@/lib/agent/run-agent";
import { getClaudeClient } from "@/lib/ai/claude";
import { translateShort } from "@/lib/ai/translate";
import { helperSystemPrompt, isSafetyQuestion } from "@/lib/helper/ask";
import { supportMinutesPatch, type SupportCheckTarget } from "@/lib/records/support-check";

import { genderNeutralRule, type NativeLang } from "./languages";

// 이슈 #349: 번역 문구 고침에 따른 코드 동작
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", async (original) => ({
  ...(await original<typeof import("@/lib/config")>()),
  getAiMode: () => "real",
  getAiModels: () => ({ main: "m", light: "m" }),
}));
vi.mock("@/lib/ai/claude", () => ({ getClaudeClient: vi.fn() }));

const TRANSLATED: Exclude<NativeLang, "ko">[] = ["vi", "zh", "mn", "en"];
const RULE_WORD: Record<Exclude<NativeLang, "ko">, string> = {
  vi: "ông/bà",
  zh: "老人",
  mn: "ахмад",
  en: "they",
};

describe("nativeReasonForms: 고치기 전 문구도 걷어 냄", () => {
  const OLD = {
    vi: "Tổng thời gian hỗ trợ dài hơn thời gian thăm",
    zh: "各项协助时间合计超过访问时间",
    mn: "Туслалцааны хугацааны нийлбэр айлчлалын хугацаанаас урт байна",
  };

  it("방문 시간 두 이유 모두 옛 vi·zh·mn 문구를 돌려준다", () => {
    const forms = nativeReasonForms([REASONS.supportMinutesExceed, REASONS.visitMinutesMissing]);
    expect(forms).toEqual(expect.arrayContaining(Object.values(OLD)));
    expect(forms).toContain("Không có thời gian thăm để kiểm tra tổng thời gian hỗ trợ");
    expect(forms).toContain("没有访问时间，无法核对协助时间合计");
    expect(forms).toContain(
      "Айлчлалын хугацаа байхгүй тул туслалцааны хугацааны нийлбэрийг шалгах боломжгүй",
    );
  });

  it.each(Object.entries(OLD))(
    "DB에 남은 옛 %s 이유는 분을 고쳐 합이 맞으면 걷어 낸다",
    (lang, old) => {
      const target: SupportCheckTarget = {
        careType: "home",
        nativeLang: lang as NativeLang,
        visitMinutes: 180,
        support: {
          value_ko: "목욕, 청소·빨래 제공하였음.",
          status: "needs_check",
          reason: `${REASONS.supportMinutesExceed} (200분 > 180분)`,
          reason_native: `${old} (200분 > 180분)`,
          detail: { minutes: { physical: 60, emotional: 60, housework: 60 } },
        },
      };
      expect(supportMinutesPatch(target)).toEqual({
        status: "observed",
        reason: "",
        reason_native: "",
      });
    },
  );
});

describe("genderNeutralRule이 번역 프롬프트에 언어별로 들어감", () => {
  it.each(TRANSLATED)("%s 지시가 있고 그 언어의 중립어를 담는다", (lang) => {
    expect(genderNeutralRule(lang)).toContain(RULE_WORD[lang]);
  });

  it("ko는 번역이 없어 빈칸", () => {
    expect(genderNeutralRule("ko")).toBe("");
  });

  it.each(TRANSLATED)(
    "%s: run-agent·added-item·helper 프롬프트에 그 언어 지시만 들어감",
    (lang) => {
      const others = TRANSLATED.filter((other) => other !== lang).map(genderNeutralRule);
      for (const prompt of [
        agentSystemPrompt("home", lang),
        addItemSystemPrompt("meal", lang),
        helperSystemPrompt(lang),
      ]) {
        expect(prompt).toContain(genderNeutralRule(lang));
        for (const rule of others) expect(prompt).not.toContain(rule);
      }
    },
  );

  it("ko 프롬프트에는 어떤 언어 지시도 없다", () => {
    for (const prompt of [
      agentSystemPrompt("facility", "ko"),
      addItemSystemPrompt("meal", "ko"),
      helperSystemPrompt("ko"),
    ]) {
      for (const lang of TRANSLATED) expect(prompt).not.toContain(genderNeutralRule(lang));
    }
  });

  describe("ai/translate 짧은 번역", () => {
    const create = vi.fn();
    beforeEach(() => {
      create.mockReset();
      create.mockResolvedValue({ content: [{ type: "text", text: '{"text":"번역"}' }] });
      vi.mocked(getClaudeClient).mockReturnValue({ messages: { create } } as never);
    });

    it.each(TRANSLATED)(
      "%s 시스템 프롬프트에 그 언어 지시와 평서문 지시가 들어감",
      async (lang) => {
        await translateShort("점심 절반 드심", lang);
        const system = create.mock.calls[0][0].system as string;
        expect(system).toContain(genderNeutralRule(lang));
        expect(system).toContain("평서문");
      },
    );

    it("ko는 모델을 부르지 않는다", async () => {
      expect(await translateShort("점심 절반 드심", "ko")).toBe("");
      expect(create).not.toHaveBeenCalled();
    });
  });
});

describe("도우미 안전 낱말(영어)", () => {
  it.each([
    "They fell asleep early last night.",
    "The resident fell asleep after lunch. How should I record sleep?",
    "How do I help with falling asleep?",
  ])("잠든 이야기는 안전 질문이 아니다: %s", (question) => {
    expect(isSafetyQuestion(question)).toBe(false);
  });

  it.each([
    "They fell down in the bathroom.",
    "The resident had a fall this morning.",
    "She fell over near the bed.",
    "He fell out of bed.",
    "They fell in the bathroom.",
    "The resident fell from the wheelchair.",
  ])("넘어짐은 안전 질문이다: %s", (question) => {
    expect(isSafetyQuestion(question)).toBe(true);
  });
});
