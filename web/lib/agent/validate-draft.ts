// 기록 검증 (Agent 도구 ③ validate_draft). AI 판단이 아니라 서버 코드 검사다.
// 근거: 문서/설계/ai규칙-v1.1.1.md '서버 검사와 예외 처리' 검사 1~6,
//       문서/설계/데이터구조-v1.2.md '공통 계약' Agent 도구 입출력.
// AI를 부르지 않으므로 키 없이 테스트한다. return_draft도 저장 직전에 같은 함수를 부른다.

export const ITEM_KEYS = [
  "visit_time",
  "support",
  "meal",
  "sleep",
  "discomfort",
  "medication",
  "cognition",
  "notes",
  "next_check",
] as const;

export type ItemKey = (typeof ITEM_KEYS)[number];

export const ITEM_STATUSES = ["observed", "not_mentioned", "needs_check"] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type CareType = "facility" | "home";

export type DraftItem = {
  item_key: ItemKey;
  value_ko: string;
  value_native: string;
  status: ItemStatus;
  evidence: string;
  reason: string;
  reason_native: string;
  detail: Record<string, unknown>;
};

export type Draft = {
  transcript_ko: string;
  items: DraftItem[];
  form_fields: Record<string, unknown>;
};

// 검증에 필요한데 Agent가 보내는 draft에는 없는 값. 서버가 DB에서 읽어 넣는다.
export type ValidateContext = {
  // records.transcript (받아쓴 글 원문). evidence는 이 글과 비교한다.
  transcript: string;
  careType: CareType;
  nativeLang?: "ko" | "vi";
  // 재가 방문 시간(분). records.visit_start~visit_end로 서버가 계산한다.
  // 없으면 form_fields.total_minutes를 쓴다.
  visitMinutes?: number | null;
  // 기록에 들어가면 안 되는 이름 목록 (실명 검사). 같은 기관 계정의 profiles.name을 넘긴다.
  // 근거: 문서/결정/2026-10-21-재가분칸-실명목록.md
  blockedNames?: string[];
};

export type ProblemCode =
  | "invalid_shape"
  | "missing_item"
  | "duplicate_item"
  | "unknown_item"
  | "wrong_order"
  | "invalid_field"
  | "evidence_not_found"
  | "evidence_too_short"
  | "observed_without_evidence"
  | "not_mentioned_with_value"
  | "support_minutes_exceed_visit"
  | "visit_minutes_missing"
  | "invalid_minutes"
  | "needs_check_without_reason"
  | "needs_check_without_evidence"
  | "observed_without_value"
  | "not_mentioned_with_evidence"
  | "form_field_not_for_facility"
  | "real_name";

export type Problem = {
  code: ProblemCode;
  item_key?: ItemKey;
  message: string;
};

export type ValidateResult = {
  // 문제가 하나도 없으면 true
  passed: boolean;
  problems: Problem[];
  // 고칠 수 있는 문제를 고친 초안 (확인 필요로 낮춤, 내용 비움, 순서 정리).
  // 형식이 깨져 고칠 수 없으면 null. 이때 부르는 쪽은 9개 모두 '확인 필요'로 둔다.
  fixed: Draft | null;
  // '확인 필요'로 낮춘 항목 (return_draft 출력의 '낮춘 항목 목록')
  downgraded: ItemKey[];
};

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
} as const;

// 서버가 추가한 이유도 한국어와 번역을 함께 바꾼다. Agent가 준 번역은 그대로 보존한다.
export const REASONS_VI: Record<string, string> = {
  [REASONS.evidenceNotFound]: "Không tìm thấy căn cứ trong lời ghi chú",
  [REASONS.evidenceTooShort]: "Câu làm căn cứ quá ngắn",
  [REASONS.observedWithoutEvidence]: "Không có câu làm căn cứ",
  [REASONS.supportMinutesExceed]: "Tổng thời gian hỗ trợ dài hơn thời gian thăm",
  [REASONS.visitMinutesMissing]: "Không có thời gian thăm để kiểm tra tổng thời gian hỗ trợ",
  [REASONS.realName]: "Có tên thật trong nội dung",
  [REASONS.invalidMinutes]: "Định dạng thời gian hỗ trợ không hợp lệ",
  [REASONS.noReason]: "AI không cung cấp lý do",
  [REASONS.observedWithoutValue]: "Không có nội dung",
  "형식 오류": "Định dạng không hợp lệ",
  "자동 정리 중단": "Đã dừng tự động sắp xếp nội dung",
};

// 재가 지원별 분 칸 키 6개 (별지 제12호). 다른 키는 쓰지 않는다.
// 근거: 문서/결정/2026-10-21-재가분칸-실명목록.md 결정 1
export const MINUTE_KEYS = [
  "physical",
  "cognitive_stimulation",
  "daily_living_together",
  "cognitive_management",
  "emotional",
  "housework",
] as const;

// 재가(별지 제12호)에만 있는 form_fields 칸. 시설(별지 제16호) 기록에는 두지 않는다.
// 근거: 문서/설계/데이터구조-v1.6.4.md 'form_fields (재가 제12호 전용)'
export const HOME_ONLY_FORM_FIELDS = [
  "total_minutes",
  "body_trend",
  "meal_trend",
  "cognition_trend",
  "stool_accidents",
  "urine_accidents",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isItemKey = (value: unknown): value is ItemKey =>
  typeof value === "string" && (ITEM_KEYS as readonly string[]).includes(value);

const isItemStatus = (value: unknown): value is ItemStatus =>
  typeof value === "string" && (ITEM_STATUSES as readonly string[]).includes(value);

// 띄어쓰기·문장부호·따옴표 차이로 근거를 놓치지 않도록, 글자와 숫자만 남겨 비교한다.
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

// 정리한 뒤 이보다 짧은 근거("네", "밥")는 거의 어느 원문에나 들어 있어 근거로 보지 않는다.
export const MIN_EVIDENCE_CHARS = 4;

export function evidenceInTranscript(evidence: string, transcript: string): boolean {
  const needle = normalizeForMatch(evidence);
  if (needle === "") return false;
  return normalizeForMatch(transcript).includes(needle);
}

const isMinuteKey = (key: string): boolean => (MINUTE_KEYS as readonly string[]).includes(key);

// 분 값은 0 이상의 정수만 맞다 (값은 정수(분), 제공하지 않으면 빼거나 0).
const isValidMinute = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

// support.detail.minutes 안의 정해진 6개 키 중 맞는 값(0 이상 정수)만 더한다.
// detail.minutes = { physical, cognitive_stimulation, daily_living_together, cognitive_management,
// emotional, housework: 분 } (별지 제12호 분 칸 6개, 문서/결정/2026-10-21-재가분칸-실명목록.md).
export function sumSupportMinutes(detail: Record<string, unknown>): number {
  const minutes = detail.minutes;
  if (!isRecord(minutes)) return 0;
  return Object.entries(minutes).reduce<number>(
    (sum, [key, value]) => (isMinuteKey(key) && isValidMinute(value) ? sum + value : sum),
    0,
  );
}

// detail.minutes의 형식 문제를 찾는다: 객체가 아님, 6개 밖의 키, 음수·소수·글자 값.
// 값 자체는 메시지에 적지 않는다(키 이름만).
export function minuteProblems(detail: Record<string, unknown>): string[] {
  if (!("minutes" in detail) || detail.minutes === undefined || detail.minutes === null) return [];
  const minutes = detail.minutes;
  if (!isRecord(minutes)) return ["minutes가 { 영역: 분 } 객체가 아닙니다."];
  const found: string[] = [];
  for (const [key, value] of Object.entries(minutes)) {
    if (!isMinuteKey(key))
      found.push(`${key}는 정해진 분 칸(${MINUTE_KEYS.join(", ")})이 아닙니다.`);
    else if (!isValidMinute(value)) found.push(`${key} 값이 0 이상의 정수(분)가 아닙니다.`);
  }
  return found;
}

function readVisitMinutes(ctx: ValidateContext, formFields: Record<string, unknown>) {
  if (typeof ctx.visitMinutes === "number") return ctx.visitMinutes;
  const total = formFields.total_minutes;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

// 이름 목록에서 검사할 수 있는 것만 남긴다. 가명 표시(○)나 한 글자는 오탐이 많아 뺀다.
function usableNames(names: string[] | undefined): string[] {
  return (names ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length >= 2 && !name.includes("○"));
}

type ParsedItem = { item: DraftItem; problems: Problem[] };

function parseItem(raw: unknown, index: number): ParsedItem | Problem {
  if (!isRecord(raw)) {
    return { code: "invalid_shape", message: `items[${index}]가 객체가 아닙니다.` };
  }
  if (!isItemKey(raw.item_key)) {
    return {
      code: "unknown_item",
      message: `items[${index}]의 item_key(${String(raw.item_key)})가 9개 항목 키가 아닙니다.`,
    };
  }
  const key = raw.item_key;
  const problems: Problem[] = [];
  const text = (name: string): string => {
    const value = raw[name];
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    problems.push({
      code: "invalid_field",
      item_key: key,
      message: `${name}이(가) 글이 아닙니다.`,
    });
    return "";
  };

  let status: ItemStatus = "needs_check";
  if (isItemStatus(raw.status)) {
    status = raw.status;
  } else {
    problems.push({
      code: "invalid_field",
      item_key: key,
      message: `status(${String(raw.status)})가 observed / not_mentioned / needs_check가 아닙니다.`,
    });
  }

  const item: DraftItem = {
    item_key: key,
    value_ko: text("value_ko"),
    value_native: text("value_native"),
    status,
    evidence: text("evidence"),
    reason: text("reason"),
    reason_native: text("reason_native"),
    detail: isRecord(raw.detail) ? raw.detail : {},
  };
  return { item, problems };
}

const reasonTranslation = (reason: string, lang: "ko" | "vi" = "vi") =>
  lang === "ko" ? reason : (REASONS_VI[reason] ?? "");

const downgrade = (item: DraftItem, reason: string, lang?: "ko" | "vi"): DraftItem => ({
  ...item,
  status: "needs_check",
  reason: item.reason ? `${item.reason}; ${reason}` : reason,
  reason_native: [item.reason_native, reasonTranslation(reason, lang)].filter(Boolean).join("; "),
});

export function validateDraft(draft: unknown, ctx: ValidateContext): ValidateResult {
  const problems: Problem[] = [];
  const fail = (): ValidateResult => ({ passed: false, problems, fixed: null, downgraded: [] });

  // 검사 1: JSON 형식과 9개 항목
  if (!isRecord(draft) || !Array.isArray(draft.items)) {
    problems.push({
      code: "invalid_shape",
      message: "draft가 객체가 아니거나 items 목록이 없습니다.",
    });
    return fail();
  }
  const transcriptKo = typeof draft.transcript_ko === "string" ? draft.transcript_ko : "";
  let formFields = isRecord(draft.form_fields) ? draft.form_fields : {};

  // 시설 기록에 재가(별지 제12호) 전용 칸이 있으면 빼고 알린다. 시설 서식에 인쇄되면 안 된다.
  if (ctx.careType === "facility") {
    const homeOnly = Object.keys(formFields).filter((key) =>
      (HOME_ONLY_FORM_FIELDS as readonly string[]).includes(key),
    );
    if (homeOnly.length > 0) {
      problems.push({
        code: "form_field_not_for_facility",
        message: `시설 기록에 재가 전용 칸(${homeOnly.join(", ")})이 있어 뺐습니다.`,
      });
      formFields = Object.fromEntries(
        Object.entries(formFields).filter(([key]) => !homeOnly.includes(key)),
      );
    }
  }

  const byKey = new Map<ItemKey, DraftItem>();
  draft.items.forEach((raw, index) => {
    const parsed = parseItem(raw, index);
    if ("code" in parsed) {
      problems.push(parsed);
      return;
    }
    problems.push(...parsed.problems);
    if (byKey.has(parsed.item.item_key)) {
      problems.push({
        code: "duplicate_item",
        item_key: parsed.item.item_key,
        message: `${parsed.item.item_key} 항목이 두 번 이상 있습니다.`,
      });
      return;
    }
    byKey.set(parsed.item.item_key, parsed.item);
  });

  for (const key of ITEM_KEYS) {
    if (!byKey.has(key)) {
      problems.push({ code: "missing_item", item_key: key, message: `${key} 항목이 없습니다.` });
    }
  }
  const fatal = problems.some((p) =>
    ["invalid_shape", "missing_item", "duplicate_item", "unknown_item"].includes(p.code),
  );
  if (fatal) return fail();

  const givenOrder = draft.items.map((raw) => (isRecord(raw) ? raw.item_key : undefined));
  if (givenOrder.some((key, i) => key !== ITEM_KEYS[i])) {
    problems.push({
      code: "wrong_order",
      message: `항목 순서가 정해진 순서(${ITEM_KEYS.join(", ")})와 다릅니다. 순서를 맞췄습니다.`,
    });
  }

  const downgraded = new Set<ItemKey>();
  const names = usableNames(ctx.blockedNames);
  const visitMinutes = ctx.careType === "home" ? readVisitMinutes(ctx, formFields) : null;

  const items = ITEM_KEYS.map((key) => {
    let item = byKey.get(key) as DraftItem;
    const lower = (reason: string) => {
      item = downgrade(item, reason, ctx.nativeLang);
      downgraded.add(key);
    };

    // 형식이 틀린 칸(status 등)은 이미 problems에 있고, 그 항목은 확인 필요로 둔다.
    if (problems.some((p) => p.code === "invalid_field" && p.item_key === key)) {
      lower("형식 오류");
    }

    // AI가 처음부터 '확인 필요'로 둔 항목: 이유와 근거가 있어야 한다 (AI 규칙 v1.1.1 '상태 판정 기준').
    // 서버가 낮춘 항목은 downgrade가 이유를 채우므로 여기서 보지 않는다.
    if (item.status === "needs_check") {
      if (!item.reason.trim()) {
        problems.push({
          code: "needs_check_without_reason",
          item_key: key,
          message: "'확인 필요'인데 이유(reason)가 비어 있습니다.",
        });
        item = {
          ...item,
          reason: REASONS.noReason,
          reason_native: reasonTranslation(REASONS.noReason, ctx.nativeLang),
        };
      }
      if (!item.evidence.trim()) {
        problems.push({
          code: "needs_check_without_evidence",
          item_key: key,
          message: "'확인 필요'인데 근거 문장(evidence)이 비어 있습니다.",
        });
      }
    }

    // 검사 4: 언급 없음인데 내용이 있음 → 내용을 비움 (지어낸 내용)
    if (item.status === "not_mentioned" && (item.value_ko.trim() || item.value_native.trim())) {
      problems.push({
        code: "not_mentioned_with_value",
        item_key: key,
        message: "'언급 없음'인데 내용이 있어 비웠습니다.",
      });
      item = { ...item, value_ko: "", value_native: "" };
    }

    // 검사 4의 근거 칸: '언급 없음'은 근거도 빈칸이다 → 근거를 비움
    if (item.status === "not_mentioned" && item.evidence.trim()) {
      problems.push({
        code: "not_mentioned_with_evidence",
        item_key: key,
        message:
          "'언급 없음'인데 근거 문장이 있어 비웠습니다. 내용이 있으면 '관찰'이나 '확인 필요'로 두세요.",
      });
      item = { ...item, evidence: "" };
    }

    // 검사 3의 내용 칸: '관찰'인데 기록 내용(value_ko)이 비었음
    if (item.status === "observed" && !item.value_ko.trim()) {
      problems.push({
        code: "observed_without_value",
        item_key: key,
        message: "'관찰'인데 기록 내용(value_ko)이 비어 있습니다.",
      });
      lower(REASONS.observedWithoutValue);
    }

    // 검사 3: 관찰인데 근거가 없음
    if (item.status === "observed" && !item.evidence.trim()) {
      problems.push({
        code: "observed_without_evidence",
        item_key: key,
        message: "'관찰'인데 근거 문장이 비어 있습니다.",
      });
      lower(REASONS.observedWithoutEvidence);
    }

    // 검사 2: 근거 문장이 원문에 실제로 있는지
    const evidenceChars = normalizeForMatch(item.evidence).length;
    if (item.evidence.trim() && evidenceChars < MIN_EVIDENCE_CHARS) {
      problems.push({
        code: "evidence_too_short",
        item_key: key,
        message: `근거 문장이 너무 짧습니다(${MIN_EVIDENCE_CHARS}글자 미만). 원문 문장을 그대로 넣어 주세요.`,
      });
      if (item.status !== "not_mentioned") lower(REASONS.evidenceTooShort);
    } else if (item.evidence.trim() && !evidenceInTranscript(item.evidence, ctx.transcript)) {
      problems.push({
        code: "evidence_not_found",
        item_key: key,
        message: `근거 문장을 원문에서 찾지 못했습니다: "${item.evidence}"`,
      });
      if (item.status !== "not_mentioned") lower(REASONS.evidenceNotFound);
    }

    // 검사 5: 재가 제공시간 합 ≤ 방문 시간
    if (key === "support" && ctx.careType === "home") {
      // 분 칸 형식: 6개 키, 0 이상 정수. 틀린 값은 합에 넣지 않고 확인 필요로 둔다.
      const minuteIssues = minuteProblems(item.detail);
      if (minuteIssues.length > 0) {
        for (const message of minuteIssues) {
          problems.push({ code: "invalid_minutes", item_key: key, message });
        }
        lower(REASONS.invalidMinutes);
      }
      const total = sumSupportMinutes(item.detail);
      if (visitMinutes === null) {
        // 방문 시간을 모르면 합을 비교할 수 없다. 분이 적힌 경우만 확인 필요로 둔다.
        if (total > 0) {
          problems.push({
            code: "visit_minutes_missing",
            item_key: key,
            message:
              "방문 시간(visit_start~visit_end, total_minutes)이 없어 제공시간 합을 확인하지 못했습니다.",
          });
          lower(REASONS.visitMinutesMissing);
        }
      } else if (total > visitMinutes) {
        problems.push({
          code: "support_minutes_exceed_visit",
          item_key: key,
          message: `지원별 제공시간 합(${total}분)이 방문 시간(${visitMinutes}분)보다 깁니다.`,
        });
        lower(`${REASONS.supportMinutesExceed} (${total}분 > ${visitMinutes}분)`);
      }
    }

    // 검사 6: 기록(한국어·모국어)에 실명이 있는지. 근거(evidence)는 원문이라 보지 않는다.
    const found = names.find(
      (name) => item.value_ko.includes(name) || item.value_native.includes(name),
    );
    if (found) {
      problems.push({
        code: "real_name",
        item_key: key,
        message: "기록 내용에 등록된 실명이 들어 있습니다.",
      });
      lower(REASONS.realName);
    }

    return item;
  });

  return {
    passed: problems.length === 0,
    problems,
    fixed: { transcript_ko: transcriptKo, items, form_fields: formFields },
    downgraded: ITEM_KEYS.filter((key) => downgraded.has(key)),
  };
}

// 끝까지 맞는 초안이 없을 때(검사 1 실패, Agent 상한 도달 등) 9개 모두 '확인 필요'로 둔 초안.
// AI 규칙 v1.1.1 '멈춤 규칙' 3번, 검사 1. 검사 1 실패 때도 원문은 보여 주므로 transcriptKo를 넘긴다.
export function allNeedsCheckDraft(
  reason: string,
  transcriptKo = "",
  nativeLang?: "ko" | "vi",
): Draft {
  return {
    transcript_ko: transcriptKo,
    items: ITEM_KEYS.map((key) => ({
      item_key: key,
      value_ko: "",
      value_native: "",
      status: "needs_check",
      evidence: "",
      reason,
      reason_native: reasonTranslation(reason, nativeLang),
      detail: {},
    })),
    form_fields: {},
  };
}
