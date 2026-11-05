// 서버 검사(validate-draft)가 붙이는 '확인 필요' 이유의 한국어 원문. 모국어 번역은 같은 폴더의 언어별 파일에 있다.
// 근거: 문서/설계/ai규칙-v2.0.5.md '서버 검사와 예외 처리', 문서/결정/2026-10-27-확인필요이유병기.md

export const REASONS = {
  evidenceNotFound: "근거를 찾지 못함",
  evidenceTooShort: "근거가 너무 짧음",
  observedWithoutEvidence: "근거 문장 없음",
  supportMinutesExceed: "지원별 제공시간 합이 방문 시간보다 김",
  visitMinutesMissing: "방문 시간이 없어 제공시간 합을 확인하지 못함",
  realName: "실명이 들어 있음",
  invalidMinutes: "제공시간 형식 오류",
  noReason: "AI가 이유를 남기지 않음",
  observedWithoutValue: "내용 없음",
  intakeUnknown: "섭취량을 정하지 못함",
  questionInValue: "기록 내용에 있던 확인 요청 문장을 이유로 옮김",
  trendWithoutComparison: "비교 표현이 없어 인지기능 변화상태(호전·유지·악화)를 정할 수 없음",
  visibleSign: "피부·몸에 보이는 변화(발적·상처·멍·부기 등)라 관리자가 확인",
  /** 검사 11: 복약 근거가 작성자 추정("드신 것 같다", "확인하지 못했다")이라 확인 필요 (이슈 #245) */
  medicationGuess: "작성자가 복약을 직접 확인하지 못함(추정)",
  /** Agent 응답이 형식에 맞지 않아 서버가 고치지 못함 */
  invalidShape: "형식 오류",
  /** Agent 응답 4번 안에 초안 반환이 없어 서버가 마지막 초안을 정리함 */
  autoStop: "자동 정리 중단",
} as const;
