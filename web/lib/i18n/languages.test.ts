import { describe, expect, it } from "vitest";

import { LANGUAGES, languageNameKo, NATIVE_LANGS, parseNativeLang } from "./languages";

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
    for (const value of ["en", "VI", "", null, undefined, 3]) {
      expect(parseNativeLang(value)).toBe("ko");
    }
  });
});
