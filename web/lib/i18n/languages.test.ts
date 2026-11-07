import { describe, expect, it } from "vitest";

import {
  isSttChecked,
  LANGUAGES,
  languageNameKo,
  NATIVE_LANGS,
  parseNativeLang,
  parseSelectableLang,
  PRE_LOGIN_LANG,
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

  it("중국어(간체)·영어는 QA를 통과해 켜져 있고, 몽골어는 켜져 있지만 받아쓰기 확인 전이다(#315·#386)", () => {
    for (const code of ["zh", "en"] as const) {
      const language = LANGUAGES.find((item) => item.code === code);
      expect(language, code).toMatchObject({ enabled: true, sttChecked: true });
      expect(isSttChecked(code)).toBe(true);
    }
    expect(LANGUAGES.find((item) => item.code === "mn")).toMatchObject({
      enabled: true,
      sttChecked: false,
    });
    expect(isSttChecked("mn")).toBe(false);
    expect(isSttChecked("ko")).toBe(true);
    expect(isSttChecked("vi")).toBe(true);
    for (const code of ["zh", "mn", "en"] as const) {
      expect(parseNativeLang(code)).toBe(code);
    }
    expect(languageNameKo("zh")).toBe("중국어(간체)");
    expect(languageNameKo("mn")).toBe("몽골어");
    expect(languageNameKo("en")).toBe("영어");
  });

  it("고를 수 있는 언어는 enabled인 것만", () => {
    expect([...SELECTABLE_LANGS]).toEqual(["ko", "vi", "zh", "mn", "en"]);
    expect(parseSelectableLang("vi")).toBe("vi");
    expect(parseSelectableLang("zh")).toBe("zh");
    expect(parseSelectableLang("mn")).toBe("mn");
    expect(parseSelectableLang("en")).toBe("en");
    for (const value of ["th", "VI", null]) {
      expect(parseSelectableLang(value)).toBeUndefined();
    }
  });
  it("로그인 전 번역 줄은 특정 모국어가 아니라 영어다(결정 2026-11-07-로그인전영어병기)", () => {
    expect(PRE_LOGIN_LANG).toBe("en");
  });
});
