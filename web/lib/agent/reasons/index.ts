// 코드 이유(REASONS)의 모국어 번역. 언어별 고정문 표를 REASONS_NATIVE에 모은다.
// 그 언어 고정문이 없으면 reason_native는 빈칸이고 화면은 한국어 이유만 보인다(빈칸은 번역 완료가 아님).
// 근거: 문서/설계/다국어확장-v2.0.0.md '목표 구조 4', 이슈 #259, 결정 2026-10-27-확인필요이유병기

import type { NativeLang } from "@/lib/i18n/languages";
import { REASONS } from "./ko";
import { REASONS_VI } from "./vi";

export { REASONS };

/** 언어 코드 → (한국어 이유 → 그 언어 고정문). ko는 번역이 없으므로 표가 없다 */
export const REASONS_NATIVE: Partial<Record<NativeLang, Record<string, string>>> = {
  vi: REASONS_VI,
};

/**
 * 코드 이유의 번역. "지원별 제공시간 합이 방문 시간보다 김 (200분 > 180분)"처럼 숫자가 붙은 이유는
 * 앞부분으로 찾아 뒤의 숫자를 그대로 붙인다. 모르는 이유나 고정문이 없는 언어는 빈칸(번역 완료가 아님).
 * ko는 번역이 없으므로 한국어 이유를 그대로 돌려준다.
 */
export function reasonTranslation(reason: string, lang: NativeLang = "vi"): string {
  if (lang === "ko") return reason;
  const table = REASONS_NATIVE[lang];
  if (!table) return "";
  const exact = table[reason];
  if (exact !== undefined) return exact;
  const prefix = Object.keys(table).find((known) => reason.startsWith(known));
  return prefix ? `${table[prefix]}${reason.slice(prefix.length)}` : "";
}

/** 주어진 한국어 이유들의 모든 언어 고정문(서버가 붙였던 번역을 걷어 낼 때 쓴다) */
export function nativeReasonForms(reasons: readonly string[]): string[] {
  return Object.values(REASONS_NATIVE).flatMap((table) =>
    reasons.map((reason) => table[reason]).filter((form): form is string => Boolean(form)),
  );
}
