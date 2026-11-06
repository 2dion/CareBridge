// 작성자 모국어 목록 한 곳. 언어를 더하면 여기와 DB 제약(profiles.native_lang, records.native_lang,
// glossary_translations.lang)을 마이그레이션으로 함께 고친다(다국어 확장 구조 v2.0.0 '목표 구조 1', 이슈 #259).
// 한국어(ko)는 '번역 없음'을 뜻한다. 새 언어는 enabled: false로 시작한다.

export type Language = {
  /** ISO 639-1. DB 값·번역 파일 이름 */
  code: "ko" | "vi" | "zh" | "mn" | "en";
  /** 한국어 이름. AI 프롬프트("~로 번역한다")와 관리자 화면에 쓴다 */
  nameKo: string;
  /** 그 언어로 쓴 이름. 언어 선택 화면에 쓴다 */
  nameNative: string;
  /** 가입·언어 선택에 보일지. QA(받아쓰기·역번역·글꼴)를 통과한 언어부터 켠다(결정 2026-11-05-모국어추가) */
  enabled: boolean;
  /** 받아쓰기 품질 확인을 마쳤는지 */
  sttChecked: boolean;
};

export const LANGUAGES: readonly Language[] = [
  { code: "ko", nameKo: "한국어", nameNative: "한국어", enabled: true, sttChecked: true },
  { code: "vi", nameKo: "베트남어", nameNative: "Tiếng Việt", enabled: true, sttChecked: true },
  // 아래 세 언어는 QA 통과 전이라 목록에만 있다(가입 화면·가입 API에서 받지 않는다)
  { code: "zh", nameKo: "중국어(간체)", nameNative: "简体中文", enabled: false, sttChecked: false },
  { code: "mn", nameKo: "몽골어", nameNative: "Монгол хэл", enabled: false, sttChecked: false },
  { code: "en", nameKo: "영어", nameNative: "English", enabled: false, sttChecked: false },
] as const;

/** 로그인 전과 새 Mock 계정의 초기 모국어. 다른 언어의 빠진 번역을 대신하지 않는다. */
export const DEFAULT_NATIVE_LANG: NativeLang = "vi";

export const NATIVE_LANGS = [
  "ko",
  "vi",
  "zh",
  "mn",
  "en",
] as const satisfies readonly Language["code"][];
export type NativeLang = (typeof NATIVE_LANGS)[number];

/** 가입·언어 선택에서 받는 값(ko는 번역 없음). enabled가 꺼진 언어는 빠진다 */
export const SELECTABLE_LANGS: readonly NativeLang[] = LANGUAGES.filter(
  (language) => language.enabled,
).map((language) => language.code);

/** 요청의 모국어 값이 지금 고를 수 있는 언어인지(가입 API가 쓴다). 아니면 undefined */
export function parseSelectableLang(value: unknown): NativeLang | undefined {
  return SELECTABLE_LANGS.find((lang) => lang === value);
}

/**
 * DB·요청의 모국어 값을 읽는다. 목록에 없는 값은 다른 언어 번역을 주지 않도록 ko(번역 없음)로 둔다.
 * 이미 저장된 값은 enabled가 꺼진 언어라도 그대로 읽는다.
 */
export function parseNativeLang(value: unknown): NativeLang {
  return NATIVE_LANGS.find((lang) => lang === value) ?? "ko";
}

/** 프롬프트에 넣는 언어의 한국어 이름(예: vi → 베트남어) */
export function languageNameKo(lang: NativeLang): string {
  return LANGUAGES.find((language) => language.code === lang)?.nameKo ?? lang;
}

// 번역문에서 어르신의 성별을 정하지 않게 하는 언어별 지시. 기록·도우미·짧은 번역 프롬프트가 함께 쓴다(이슈 #349)
const GENDER_NEUTRAL: Partial<Record<NativeLang, string>> = {
  vi: '어르신은 "ông/bà"로 쓰고 "cô ấy", "ông ấy", "bà ấy", "cụ ông", "cụ bà"처럼 성별이 드러나는 말을 쓰지 않는다.',
  zh: '어르신은 "老人"으로 쓰고 "他", "她", "爷爷", "奶奶"처럼 성별이 드러나는 말을 쓰지 않는다.',
  mn: '어르신은 "ахмад настан"으로 쓰고 "өвөө", "эмээ"처럼 성별이 드러나는 말을 쓰지 않는다.',
  en: '어르신은 "they"로 쓰고 "he", "she", "grandma", "grandpa"처럼 성별이 드러나는 말을 쓰지 않는다.',
};

/** 번역 프롬프트에 넣을 성별 중립 지시. ko는 번역이 없어 빈칸 */
export function genderNeutralRule(lang: NativeLang): string {
  return GENDER_NEUTRAL[lang] ?? "";
}
