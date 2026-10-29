// records.form_type은 DB에서 smallint(16 / 12)라 Supabase가 숫자로 돌려준다. 공통 계약과 화면은 "16" / "12" 글자를 쓴다.
// 숫자와 글자를 섞어 비교하다 재가 기록을 시설로 잘못 본 일이 있어(10/29, #115 #116) 변환을 한 곳에 둔다.
// 근거: 문서/설계/데이터구조-v1.6.4.md 상태 값 목록 records.form_type

import type { CareType } from "@/lib/agent/validate-draft";

export type FormType = "16" | "12";

/** DB 값(숫자 12·16, 글자 "12"·"16")을 계약의 글자 값으로. 그 밖의 값은 시설(16)로 본다 */
export function toFormType(value: unknown): FormType {
  return String(value).trim() === "12" ? "12" : "16";
}

/** 서식으로 급여 종류를 정한다: 제12호 = 재가, 제16호 = 시설 */
export function careTypeOf(value: unknown): CareType {
  return toFormType(value) === "12" ? "home" : "facility";
}
