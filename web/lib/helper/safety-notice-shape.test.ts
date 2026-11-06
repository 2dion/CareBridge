import { describe, expect, it } from "vitest";

import { roleNames } from "@/lib/demo/roles";
import type { NativeLang } from "@/lib/i18n/languages";

import { notFoundAnswer, safetyNotice, withSafetyNotice } from "./ask";
import { HELPER_FIXED } from "./fixed-text";

// #315 확인 뒤 고친 안전 안내 붙이기(be/helper-notice-mn-zh) 재검토
const answer = { ko: "의자에 앉혀 주세요.", native: "", source: null, found: true };
const LANGS: NativeLang[] = ["vi", "zh", "mn", "en"];

describe("모국어 고정문의 문장 첫 글자", () => {
  it.each(LANGS.flatMap((lang) => [false, true].map((t) => [lang, t] as const)))(
    "%s(교육용 %s): 안전 안내의 각 문장이 소문자로 시작하지 않는다",
    (lang, training) => {
      const text = safetyNotice(roleNames(training), lang).native;
      for (const sentence of text.split(/(?<=[.!?。！？])\s*/).filter(Boolean)) {
        expect(sentence.charAt(0)).not.toMatch(/\p{Ll}/u);
      }
    },
  );

  // 몽골어 notFound의 둘째 문장도 '~에게서'(탈격) 이름으로 시작한다: "…олсонгүй. менежерээс асууна уу."
  it.each([false, true])("mn(교육용 %s): 교재 없음 안내 둘째 문장도 대문자로 시작", (training) => {
    const text = notFoundAnswer(roleNames(training), "mn").native;
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      expect(sentence.charAt(0)).not.toMatch(/\p{Ll}/u);
    }
  });

  it.each(["vi", "zh", "en"] as const)(
    "%s 교재 없음 안내는 문장 첫 글자가 소문자가 아님",
    (lang) => {
      for (const training of [false, true]) {
        const text = notFoundAnswer(roleNames(training), lang).native;
        for (const sentence of text.split(/(?<=[.!?。])\s*/).filter(Boolean)) {
          expect(sentence.charAt(0)).not.toMatch(/\p{Ll}/u);
        }
      }
    },
  );
});

describe("withSafetyNotice 결합 규칙", () => {
  it("ko는 이전과 같이 한 칸 띄워 앞에 붙인다", () => {
    const notice = safetyNotice(roleNames(false), "zh");
    expect(withSafetyNotice(answer, notice).ko).toBe(`${notice.ko} ${answer.ko}`);
  });

  it("이미 들어 있으면 ko·native 모두 다시 붙이지 않는다", () => {
    for (const lang of LANGS) {
      const notice = safetyNotice(roleNames(false), lang);
      const already = { ...answer, ko: `${notice.ko} 답`, native: `${notice.native} 답` };
      expect(withSafetyNotice(already, notice)).toEqual(already);
    }
  });

  it("native가 빈칸이면 빈칸 그대로(한국어만 보임)", () => {
    for (const lang of LANGS) {
      const out = withSafetyNotice(answer, safetyNotice(roleNames(false), lang));
      expect(out.native).toBe("");
    }
  });

  it.each([
    ["vi", "Hãy để ông/bà ngồi xuống."],
    ["en", "Help them sit."],
    ["mn", "Суулгана уу."],
  ] as const)("%s는 안내와 답 사이를 한 칸 띄운다", (lang, native) => {
    const notice = safetyNotice(roleNames(true), lang);
    expect(withSafetyNotice({ ...answer, native }, notice).native).toBe(
      `${notice.native} ${native}`,
    );
  });

  it("zh는 교육용 기관에서도 띄우지 않는다", () => {
    const notice = safetyNotice(roleNames(true), "zh");
    expect(notice.native).toBe("请立即向讲师报告。");
    expect(withSafetyNotice({ ...answer, native: "先让老人坐下。" }, notice).native).toBe(
      "请立即向讲师报告。先让老人坐下。",
    );
  });

  it("중국어 고정문은 모두 。로 끝나 띄어쓰기 규칙이 적용된다", () => {
    const zh = HELPER_FIXED.zh!;
    expect(zh.safety("管理员")).toMatch(/。$/);
  });
});
