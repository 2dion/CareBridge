// 재가 제공 지원 재검사: 작성자가 W3에서 지원별 분(support.detail.minutes)이나 방문 시점을 고친 뒤와
// 전송(submit) 직전에 검사 5(지원별 제공시간 합 ≤ 방문 시간)를 다시 해 '확인 필요'와 이유를 맞춘다 (이슈 #116).
// 근거: 문서/설계/ai규칙-v1.1.5.md '서버 검사와 예외 처리' 검사 5, 문서/결정/2026-10-29-초안검사보강.md
// 검사 자체는 Agent 초안 검증과 같은 코드(validate-draft.ts checkSupportMinutes)다.
// reason·reason_native는 서버만 쓰는 칸이라 저장은 service_role 전용 save_ai_item(check)으로 한다.
// DB 호출은 SupportCheckDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

import {
  checkSupportMinutes,
  REASONS,
  REASONS_VI,
  reasonTranslation,
  type CareType,
  type ItemStatus,
} from "@/lib/agent/validate-draft";

export type SupportCheckItem = {
  value_ko: string;
  status: ItemStatus;
  reason: string;
  reason_native: string;
  detail: Record<string, unknown>;
};

export type SupportCheckTarget = {
  careType: CareType;
  nativeLang: "ko" | "vi";
  /** 방문 시간(분). records.visit_start~visit_end → form_fields.total_minutes → visit_time detail 순. 모르면 null */
  visitMinutes: number | null;
  support: SupportCheckItem;
};

/** save_ai_item(check)이 바꾸는 세 칸 */
export type SupportCheckPatch = { status: ItemStatus; reason: string; reason_native: string };

export type SupportCheckDeps = {
  /** 로그인한 작성자 권한(RLS)으로 읽음. 기록을 볼 수 없거나 재가가 아니면 null */
  readTarget(recordId: string): Promise<SupportCheckTarget | null>;
  /** save_ai_item(check): status·reason·reason_native만 바꿈. 그사이 value_ko가 바뀌면 stale_item */
  applyCheck(
    recordId: string,
    actorId: string,
    expectedValueKo: string,
    patch: SupportCheckPatch,
  ): Promise<void>;
};

// 검사 5가 붙이는 코드 이유. 재검사 때 이 이유만 걷어 내고 다시 붙인다. AI가 쓴 이유는 그대로 둔다.
const SERVER_REASONS = [
  REASONS.supportMinutesExceed,
  REASONS.visitMinutesMissing,
  REASONS.invalidMinutes,
] as const;
const SERVER_REASONS_VI = SERVER_REASONS.map((reason) => REASONS_VI[reason]);

const splitReasons = (text: string) =>
  text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

const isServerReason = (part: string) =>
  SERVER_REASONS.some((known) => part.startsWith(known)) ||
  SERVER_REASONS_VI.some((known) => part.startsWith(known));

/**
 * 지금 제공 지원 항목에 맞는 status·reason·reason_native. 바꿀 것이 없으면 null.
 * - 합이 방문 시간보다 길면(또는 방문 시간이 없는데 분이 있으면) '확인 필요' + 코드 이유(한국어·모국어)
 * - 합이 맞으면 서버가 붙였던 코드 이유만 걷어 낸다. 다른 이유가 없고 내용이 있으면 '관찰'로 돌아간다
 */
export function supportMinutesPatch(target: SupportCheckTarget): SupportCheckPatch | null {
  if (target.careType !== "home") return null;
  const { support } = target;
  const { reasons } = checkSupportMinutes(support.detail, target.visitMinutes);
  const givenKo = splitReasons(support.reason);
  const keptKo = givenKo.filter((part) => !isServerReason(part));
  const keptVi = splitReasons(support.reason_native).filter((part) => !isServerReason(part));

  let next: SupportCheckPatch;
  if (reasons.length > 0) {
    next = {
      status: "needs_check",
      reason: [...keptKo, ...reasons].join("; "),
      reason_native: [
        ...keptVi,
        ...reasons.map((reason) => reasonTranslation(reason, target.nativeLang)),
      ]
        .filter(Boolean)
        .join("; "),
    };
  } else {
    if (keptKo.length === givenKo.length) return null; // 서버가 붙인 이유가 없으면 손대지 않음
    next = {
      status: keptKo.length === 0 && support.value_ko.trim() ? "observed" : support.status,
      reason: keptKo.join("; "),
      reason_native: keptVi.join("; "),
    };
  }
  const same =
    next.status === support.status &&
    next.reason === support.reason &&
    next.reason_native === support.reason_native;
  return same ? null : next;
}

/** 기록 하나의 제공 지원을 다시 검사해 바뀐 것이 있으면 저장한다. 저장한 patch(없으면 null)를 돌려줌 */
export async function recheckSupportMinutes(
  recordId: string,
  actorId: string,
  deps: SupportCheckDeps,
): Promise<SupportCheckPatch | null> {
  const target = await deps.readTarget(recordId);
  if (!target) return null;
  const patch = supportMinutesPatch(target);
  if (patch) await deps.applyCheck(recordId, actorId, target.support.value_ko, patch);
  return patch;
}
