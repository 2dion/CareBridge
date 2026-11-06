// 코드 이유의 중국어(간체) 고정문. 한국어 원문(ko.ts의 REASONS 값)이 키다. 결정 2026-11-05-모국어추가.
// ⚠️ Claude 초안(검수 전). 성별을 정하지 않는 중립 표현을 쓴다.

import { REASONS } from "./ko";

export const REASONS_ZH: Record<string, string> = {
  [REASONS.evidenceNotFound]: "在原文中找不到依据",
  [REASONS.evidenceTooShort]: "作为依据的句子太短",
  [REASONS.observedWithoutEvidence]: "没有作为依据的句子",
  [REASONS.supportMinutesExceed]: "各项协助时间合计超过上门服务时间",
  [REASONS.visitMinutesMissing]: "没有上门服务时间，无法核对协助时间合计",
  [REASONS.realName]: "内容中含有真实姓名",
  [REASONS.invalidMinutes]: "协助时间格式不正确",
  [REASONS.noReason]: "AI 未提供理由",
  [REASONS.observedWithoutValue]: "没有内容",
  [REASONS.intakeUnknown]: "无法确定进食量",
  [REASONS.questionInValue]: "请求确认的句子已移到理由中",
  [REASONS.trendWithoutComparison]: "没有对比说明，无法判断认知功能变化（改善/维持/恶化）",
  [REASONS.visibleSign]: "皮肤/身体上可见的变化（发红、伤口、淤青、肿胀等），需要管理员确认",
  [REASONS.medicationGuess]: "记录员没有亲自确认服药情况（推测）",
  [REASONS.invalidShape]: "格式不正确",
  [REASONS.autoStop]: "已停止自动整理内容",
};
