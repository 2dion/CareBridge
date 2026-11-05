import { describe, expect, it } from "vitest";

import {
  LANGUAGES,
  languageNameKo,
  NATIVE_LANGS,
  parseNativeLang,
  parseSelectableLang,
  SELECTABLE_LANGS,
} from "./languages";

describe("언어 목록(languages.ts)", () => {
  it("NATIVE_LANGS와 LANGUAGES의 코드가 같다", () => {
    expect(LANGUAGES.map((language) => language.code)).toEqual([...NATIVE_LANGS]);
  });

  it("프롬프트용 한국어 이름을 준다", () => {
    expect(languageNameKo("vi")).toBe("베트남어");
    expect(languageNameKo("ko")).toBe("한국어");
  });

  it("모르는 값은 베트남어가 아니라 ko(번역 없음)", () => {
    expect(parseNativeLang("vi")).toBe("vi");
    for (const value of ["th", "VI", "", null, undefined, 3]) {
      expect(parseNativeLang(value)).toBe("ko");
    }
  });

  it("중국어(간체)·몽골어·영어가 목록에 있고 QA 통과 전이라 꺼져 있다", () => {
    for (const code of ["zh", "mn", "en"] as const) {
      const language = LANGUAGES.find((item) => item.code === code);
      expect(language, code).toMatchObject({ enabled: false, sttChecked: false });
      expect(parseNativeLang(code)).toBe(code);
    }
    expect(languageNameKo("zh")).toBe("중국어(간체)");
    expect(languageNameKo("mn")).toBe("몽골어");
    expect(languageNameKo("en")).toBe("영어");
  });

  it("고를 수 있는 언어는 enabled인 것만", () => {
    expect([...SELECTABLE_LANGS]).toEqual(["ko", "vi"]);
    expect(parseSelectableLang("vi")).toBe("vi");
    for (const value of ["zh", "mn", "en", "th", null]) {
      expect(parseSelectableLang(value)).toBeUndefined();
    }
  });
});
