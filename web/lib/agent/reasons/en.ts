// 코드 이유의 영어 고정문. 한국어 원문(ko.ts의 REASONS 값)이 키다. 결정 2026-11-05-모국어추가.
// ⚠️ Claude 초안(검수 전). 성별을 정하지 않는 중립 표현을 쓴다.

import { REASONS } from "./ko";

export const REASONS_EN: Record<string, string> = {
  [REASONS.evidenceNotFound]: "No supporting sentence found in the spoken notes",
  [REASONS.evidenceTooShort]: "The supporting sentence is too short",
  [REASONS.observedWithoutEvidence]: "There is no supporting sentence",
  [REASONS.supportMinutesExceed]: "The total support time is longer than the visit time",
  [REASONS.visitMinutesMissing]: "No visit time, so the total support time cannot be checked",
  [REASONS.realName]: "A real name appears in the text",
  [REASONS.invalidMinutes]: "The support time format is not valid",
  [REASONS.noReason]: "The AI gave no reason",
  [REASONS.observedWithoutValue]: "There is no content",
  [REASONS.intakeUnknown]: "The amount eaten could not be determined",
  [REASONS.questionInValue]: "A sentence asking for confirmation was moved into the reason",
  [REASONS.trendWithoutComparison]:
    "No comparison was mentioned, so the change in cognitive function (improved/same/worse) cannot be determined",
  [REASONS.visibleSign]:
    "A visible change on the skin or body (redness, wound, bruise, swelling...), so the manager needs to confirm",
  [REASONS.medicationGuess]:
    "The writer did not personally confirm the medication was taken (a guess)",
  [REASONS.invalidShape]: "The format is not valid",
  [REASONS.autoStop]: "Automatic organizing of the content was stopped",
};
