// 작성자 모국어 목록 한 곳. 언어를 더하면 여기와 DB 제약(profiles.native_lang, records.native_lang,
// glossary_translations.lang)을 마이그레이션으로 함께 고친다(다국어 확장 구조 v2.0.0 '목표 구조 1', 이슈 #259).
// MVP는 vi 하나다. 한국어(ko)는 '번역 없음'을 뜻한다.

export type Language = {
  /** ISO 639-1. DB 값·번역 파일 이름 */
  code: "ko" | "vi";
  /** 한국어 이름. AI 프롬프트("~로 번역한다")와 관리자 화면에 쓴다 */
  nameKo: string;
  /** 그 언어로 쓴 이름. 언어 선택 화면(추후 적용)에 쓴다 */
  nameNative: string;
};

export const LANGUAGES: readonly Language[] = [
  { code: "ko", nameKo: "한국어", nameNative: "한국어" },
  { code: "vi", nameKo: "베트남어", nameNative: "Tiếng Việt" },
] as const;

export const NATIVE_LANGS = ["ko", "vi"] as const satisfies readonly Language["code"][];
export type NativeLang = (typeof NATIVE_LANGS)[number];

/** DB·요청의 모국어 값을 읽는다. 목록에 없는 값은 다른 언어 번역을 주지 않도록 ko(번역 없음)로 둔다. */
export function parseNativeLang(value: unknown): NativeLang {
  return NATIVE_LANGS.find((lang) => lang === value) ?? "ko";
}

/** 프롬프트에 넣는 언어의 한국어 이름(예: vi → 베트남어) */
export function languageNameKo(lang: NativeLang): string {
  return LANGUAGES.find((language) => language.code === lang)?.nameKo ?? lang;
}
