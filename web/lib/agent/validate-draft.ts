// 기록 검증 (Agent 도구 ③ validate_draft). AI 판단이 아니라 서버 코드 검사다.
// 근거: 문서/설계/ai규칙-v1.1.3.md '서버 검사와 예외 처리' 검사 1~6,
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
  | "needs_check_without_value"
  | "observed_without_value"
  | "not_mentioned_with_evidence"
  | "form_field_not_for_facility"
  | "invalid_intake"
  | "question_in_value"
  | "real_name"
  | "form_field_without_evidence"
  | "trend_without_comparison"
  | "visible_sign_observed";

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
  intakeUnknown: "섭취량을 정하지 못함",
  questionInValue: "기록 내용에 있던 확인 요청 문장을 이유로 옮김",
  trendWithoutComparison: "비교 표현이 없어 인지기능 변화상태(호전·유지·악화)를 정할 수 없음",
  visibleSign: "피부·몸에 보이는 변화(발적·상처·멍·부기 등)라 관리자가 확인",
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
  [REASONS.intakeUnknown]: "Chưa xác định được lượng ăn",
  [REASONS.questionInValue]: "Câu yêu cầu xác nhận trong nội dung đã được chuyển sang lý do",
  [REASONS.trendWithoutComparison]:
    "Không có lời so sánh nên không xác định được thay đổi chức năng nhận thức (cải thiện/giữ nguyên/xấu đi)",
  [REASONS.visibleSign]:
    "Thay đổi nhìn thấy trên da/cơ thể (đỏ, vết thương, bầm, sưng...) nên người quản lý cần xác nhận",
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
// 근거: 문서/설계/데이터구조-v1.6.5.md 'form_fields (재가 제12호 전용)'
export const HOME_ONLY_FORM_FIELDS = [
  "total_minutes",
  "body_trend",
  "meal_trend",
  "cognition_trend",
  "stool_accidents",
  "urine_accidents",
] as const;

// 식사 섭취량(meal.detail.intake)의 저장 값. 별지 제16호 섭취량 칸 1 / 1/2 이상 / 1/2 미만에 대응한다.
// 서식 기준(form-spec)·인쇄(print/fields.ts)·정답 사례(data/cases)가 같은 세 값을 쓴다 (이슈 #133).
export const INTAKE_VALUES = ["full", "half_or_more", "under_half"] as const;

export type Intake = (typeof INTAKE_VALUES)[number];

export const isIntake = (value: unknown): value is Intake =>
  typeof value === "string" && (INTAKE_VALUES as readonly string[]).includes(value);

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
  const haystack = normalizeForMatch(transcript);
  if (haystack.includes(needle)) return true;
  // 근거가 원문의 떨어진 문장 여러 개를 이어 붙인 것이면("2번째 문장. 8번째 문장.") 문장마다 원문에 있는지 본다.
  // 문장 하나라도 원문에 없으면 근거를 찾지 못한 것이다.
  const parts = evidence
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(normalizeForMatch)
    .filter(Boolean);
  return parts.length > 1 && parts.every((part) => haystack.includes(part));
}

// 검사 9: 재가 변화상태(호전·유지·악화)는 원문에 비교가 있을 때만 정한다(AI 규칙 쓰기 원칙 2, 프롬프트 규칙 4).
// 프롬프트만으로는 AI가 '유지'(same)를 채워 인쇄에 체크되므로 서버가 거른다.
export const COMPARISON_WORDS = [
  "좋아지",
  "좋아졌",
  "나아지",
  "나아졌",
  "나빠지",
  "나빠졌",
  "호전",
  "악화",
  "전보다",
  "어제보다",
  "지난번보다",
  "평소보다",
  "평소와",
  "평소처럼",
  "평소랑",
  "예전보다",
  "여전",
  "그대로",
  "똑같",
  "변함없",
  "변화 없",
  "달라지",
  "달라졌",
  "tốt hơn",
  "kém hơn",
  "xấu đi",
  "như cũ",
  "như mọi khi",
  "vẫn như",
  "không thay đổi",
] as const;

export const hasComparison = (text: string): boolean => {
  const normalized = text.normalize("NFC").toLowerCase();
  return COMPARISON_WORDS.some((word) => normalized.includes(word));
};

export const TREND_VALUES = ["improved", "same", "worse"] as const;
const TREND_FIELDS = ["body_trend", "meal_trend", "cognition_trend"] as const;
const ACCIDENT_FIELDS = ["stool_accidents", "urine_accidents"] as const;
// 배변 실수 칸은 원문에 대변·소변·실수·기저귀 이야기가 있을 때만 둔다. 말하지 않은 0회를 지어내지 않는다.
const ACCIDENT_WORDS = /대변|소변|배변|실수|실금|기저귀|tã|đại tiện|tiểu tiện|đi ngoài|són/i;

// 검사 10: 불편감 표현에 피부·몸에 보이는 변화가 있으면 '확인 필요'(프롬프트 규칙 3 '상처'). 같은 말이 기록마다
// 관찰·확인 필요로 갈리지 않게 서버가 정한다. "상처 없음"처럼 없다고 한 말은 걸지 않는다.
export const VISIBLE_SIGN_WORDS = [
  "발적",
  "빨개",
  "빨갛",
  "붉",
  "상처",
  "멍",
  "부기",
  "붓기",
  "부었",
  "부어",
  "부종",
  "물집",
  "까졌",
  "벗겨",
  "출혈",
  "피가",
  "đỏ",
  "vết thương",
  "bầm",
  "sưng",
  "phồng",
  "chảy máu",
] as const;

export function hasVisibleSign(text: string): boolean {
  const normalized = text.normalize("NFC").toLowerCase();
  return VISIBLE_SIGN_WORDS.some((word) => {
    let from = 0;
    for (;;) {
      const at = normalized.indexOf(word, from);
      if (at < 0) return false;
      // 바로 뒤(8글자 안)에 없다고 한 말이 있으면 넘어간다: "상처는 없다고 하심", "không có vết thương"은 앞을 본다
      const after = normalized.slice(at + word.length, at + word.length + 8);
      const before = normalized.slice(Math.max(0, at - 9), at);
      if (!/없|아니|않/.test(after) && !/không( có)?\s*$/.test(before)) return true;
      from = at + word.length;
    }
  });
}

// AI가 확인을 요청하는 말. 기록 내용(value_ko)은 공식 기록이라 이런 문장이 들어가면 안 되고, reason에만 둔다 (이슈 #117).
// 프롬프트만 고치면 다시 섞일 수 있어 서버가 거른다.
export const QUESTION_PHRASES = [
  "확인 필요",
  "확인이 필요",
  "확인해 주세요",
  "확인해주세요",
  "확인 요망",
  "확인 바람",
  "확인 요청",
  "확인할 것",
  "용어 확인",
] as const;

// '불명확'·'불분명'은 AI의 의문("~인지 불명확")일 때만 확인 요청이다. "발음이 불분명하심"처럼
// 원문에서 관찰한 증상을 적은 말은 정상 기록이라 걸지 않는다 (이슈 #177).
const DOUBT_PATTERNS = [
  /지\s*불(?:명확|분명)/,
  /불(?:명확|분명)(?:함|하다|합니다)?\s*[(（]/,
] as const;

export const hasQuestionPhrase = (text: string): boolean =>
  QUESTION_PHRASES.some((phrase) => text.includes(phrase)) ||
  DOUBT_PATTERNS.some((pattern) => pattern.test(text));

// 확인 요청이 든 부분을 기록 내용에서 뺀다. 괄호 안 확인 요청("(섭취량 확인 필요)")은 괄호째 빼고,
// 나머지는 쉼표로 나눈 토막 단위로 뺀다("점심 절반 드심, 양 확인 필요" → "점심 절반 드심").
// 토막이 하나뿐이면 그 문장(., !, ?, 줄바꿈)을 뺀다. 숫자 안의 점("1.5")에서는 문장을 자르지 않는다.
// kept는 남은 기록 내용, removed는 뺀 부분이다.
export function stripQuestionSentences(text: string): { kept: string; removed: string } {
  const removed: string[] = [];
  const kept: string[] = [];
  for (const sentence of text.match(/(?:[^.!?\n]|(?<=\d)\.(?=\d))+[.!?]*/g) ?? []) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (!hasQuestionPhrase(trimmed)) {
      kept.push(trimmed);
      continue;
    }
    // 괄호 안에만 확인 요청이 있으면 괄호만 빼고 문장은 남긴다
    const parens: string[] = [];
    const withoutParens = trimmed.replace(/[(（][^()（）]*[)）]/g, (group) => {
      if (!hasQuestionPhrase(group)) return group;
      parens.push(group.slice(1, -1).trim());
      return "";
    });
    if (parens.length > 0 && !hasQuestionPhrase(withoutParens)) {
      kept.push(withoutParens);
      removed.push(...parens);
      continue;
    }
    // 쉼표로 나눈 토막 중 확인 요청이 없는 토막은 남긴다
    const body = withoutParens.replace(/[.!?]+$/, "");
    const clauses = body.split(/\s*[,，;；]\s*/).filter(Boolean);
    const clean = clauses.filter((clause) => !hasQuestionPhrase(clause));
    if (clauses.length > 1 && clean.length > 0) {
      kept.push(`${clean.join(", ")}${/[.!?]$/.test(trimmed) ? trimmed.slice(-1) : ""}`);
      removed.push(...parens, ...clauses.filter((clause) => hasQuestionPhrase(clause)));
    } else {
      removed.push(trimmed);
    }
  }
  return {
    kept: kept
      .join(" ")
      .replace(/\s+([.,!?])/g, "$1")
      .trim(),
    removed: removed.join(" "),
  };
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

// 검사 5: 재가 제공시간 합 ≤ 방문 시간. 분 칸 형식(6개 키, 0 이상 정수)도 함께 본다.
// Agent 초안 검증(validateDraft)과 작성자가 분·방문 시간을 고친 뒤의 재검사(records/support-check.ts)가 같은 코드를 쓴다 (이슈 #116).
// visitMinutes가 null이면 방문 시간을 모르는 것이라, 분이 적힌 경우만 '확인 필요'로 둔다.
export function checkSupportMinutes(
  detail: Record<string, unknown>,
  visitMinutes: number | null,
): { problems: Omit<Problem, "item_key">[]; reasons: string[] } {
  const problems: Omit<Problem, "item_key">[] = [];
  const reasons: string[] = [];
  const minuteIssues = minuteProblems(detail);
  if (minuteIssues.length > 0) {
    for (const message of minuteIssues) problems.push({ code: "invalid_minutes", message });
    reasons.push(REASONS.invalidMinutes);
  }
  const total = sumSupportMinutes(detail);
  if (visitMinutes === null) {
    if (total > 0) {
      problems.push({
        code: "visit_minutes_missing",
        message:
          "방문 시간(visit_start~visit_end, total_minutes)이 없어 제공시간 합을 확인하지 못했습니다.",
      });
      reasons.push(REASONS.visitMinutesMissing);
    }
  } else if (total > visitMinutes) {
    problems.push({
      code: "support_minutes_exceed_visit",
      message: `지원별 제공시간 합(${total}분)이 방문 시간(${visitMinutes}분)보다 깁니다.`,
    });
    reasons.push(`${REASONS.supportMinutesExceed} (${total}분 > ${visitMinutes}분)`);
  }
  return { problems, reasons };
}

// "HH:MM"(DB time 칸의 "HH:MM:SS" 포함) 두 시각 사이의 분. 형식이 틀리거나 종료가 시작보다 앞서면 null.
export function minutesBetween(start: unknown, end: unknown): number | null {
  const parse = (value: unknown) => {
    if (typeof value !== "string") return null;
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
  };
  const from = parse(start);
  const to = parse(end);
  return from === null || to === null || to < from ? null : to - from;
}

// 재가 방문 시간(분): records.visit_start~visit_end(서버가 계산해 넘김) → form_fields.total_minutes
// → visit_time 항목 detail.start·end("HH:MM") 순으로 찾는다. 모두 없으면 null.
export function resolveVisitMinutes(
  known: number | null | undefined,
  formFields: Record<string, unknown>,
  visitTimeDetail: Record<string, unknown> = {},
): number | null {
  if (typeof known === "number" && Number.isFinite(known)) return known;
  const total = formFields.total_minutes;
  if (typeof total === "number" && Number.isFinite(total)) return total;
  return minutesBetween(visitTimeDetail.start, visitTimeDetail.end);
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

// 코드 이유의 번역. "지원별 제공시간 합이 방문 시간보다 김 (200분 > 180분)"처럼 숫자가 붙은 이유는
// 앞부분으로 찾아 뒤의 숫자를 그대로 붙인다. 모르는 이유는 빈칸(번역 완료가 아님).
export function reasonTranslation(reason: string, lang: "ko" | "vi" = "vi"): string {
  if (lang === "ko") return reason;
  const exact = REASONS_VI[reason];
  if (exact !== undefined) return exact;
  const prefix = Object.keys(REASONS_VI).find((known) => reason.startsWith(known));
  return prefix ? `${REASONS_VI[prefix]}${reason.slice(prefix.length)}` : "";
}

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

  // 검사 9: 재가 서식 칸(변화상태·배변 실수)은 원문에 근거가 있을 때만 둔다. 근거 없는 값은 빼고 알린다.
  const sourceText = `${ctx.transcript}\n${transcriptKo}`;
  const compared = hasComparison(sourceText);
  if (ctx.careType === "home") {
    const dropped: string[] = [];
    for (const key of TREND_FIELDS) {
      const value = formFields[key];
      if (value === undefined || value === null || value === "") continue;
      if (!compared || !(TREND_VALUES as readonly unknown[]).includes(value)) dropped.push(key);
    }
    for (const key of ACCIDENT_FIELDS) {
      const value = formFields[key];
      if (value === undefined || value === null || value === "") continue;
      if (!ACCIDENT_WORDS.test(sourceText) || !isValidMinute(value)) dropped.push(key);
    }
    if (dropped.length > 0) {
      problems.push({
        code: "form_field_without_evidence",
        message: `원문에 근거가 없는 서식 칸(${dropped.join(", ")})을 뺐습니다. 변화상태는 원문에 비교 표현이 있을 때만, 배변 실수 횟수는 원문에 말이 있을 때만 쓰세요.`,
      });
      formFields = Object.fromEntries(
        Object.entries(formFields).filter(([key]) => !dropped.includes(key)),
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
  const visitMinutes =
    ctx.careType === "home"
      ? resolveVisitMinutes(ctx.visitMinutes, formFields, byKey.get("visit_time")?.detail ?? {})
      : null;

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

    // AI가 처음부터 '확인 필요'로 둔 항목: 이유와 근거가 있어야 한다 (AI 규칙 v1.1.3 '상태 판정 기준').
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

    // 검사 8: 기록 내용(value_ko)에 AI의 확인 요청 문장이 있으면 빼서 reason으로 옮긴다 (이슈 #117).
    // 내용은 원문을 기록체로 정리한 것만 남고, 확인할 까닭은 reason에만 둔다. 항목은 '확인 필요'가 된다.
    // 다음 확인사항(next_check)은 내용 자체가 "혈압 확인 필요" 같은 할 일이라 검사하지 않는다 (이슈 #177).
    if (
      item.status !== "not_mentioned" &&
      key !== "next_check" &&
      hasQuestionPhrase(item.value_ko)
    ) {
      const { kept, removed } = stripQuestionSentences(item.value_ko);
      problems.push({
        code: "question_in_value",
        item_key: key,
        message: `기록 내용(value_ko)에 확인 요청 문장이 있어 뺐습니다: "${removed}". 확인할 까닭은 reason에만 쓰고, value_ko에는 기록체로 정리한 내용만 쓰세요.`,
      });
      const wasObserved = item.status === "observed";
      item = {
        ...item,
        value_ko: kept,
        value_native: kept ? item.value_native : "",
        status: "needs_check",
        reason: item.reason.trim() ? item.reason : removed,
        reason_native: item.reason_native.trim()
          ? item.reason_native
          : reasonTranslation(REASONS.questionInValue, ctx.nativeLang),
      };
      if (wasObserved) downgraded.add(key);
    }

    // '확인 필요'는 짐작한 내용 + 이유다. 내용이 비면 화면의 'AI가 정리한 내용'이 빈칸이 되므로
    // Agent에게 알려 근거 문장을 기록체로 옮겨 채우게 한다 (이슈 #141). 상태는 그대로 둔다.
    // 자동 정리 중단 초안(allNeedsCheckDraft)도 이 문제로 알리지만 저장은 막지 않는다.
    if (item.status === "needs_check" && !item.value_ko.trim()) {
      problems.push({
        code: "needs_check_without_value",
        item_key: key,
        message:
          "'확인 필요'인데 기록 내용(value_ko)이 비어 있습니다. 근거 문장을 기록체로 옮겨 짐작한 내용을 쓰고, 확인할 까닭은 reason에 두세요.",
      });
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

    // 검사 7: 식사 섭취량 값은 full / half_or_more / under_half 중 하나다 (이슈 #133).
    // 다른 값("1/2 이상", "needs_check" 등)은 서식에 체크를 찍지 못하므로 빼고, 식사를 '확인 필요'로 둔다.
    if (key === "meal" && item.detail.intake !== undefined && item.detail.intake !== null) {
      if (!isIntake(item.detail.intake)) {
        problems.push({
          code: "invalid_intake",
          item_key: key,
          message: `detail.intake(${String(item.detail.intake)})가 ${INTAKE_VALUES.join(" / ")} 중 하나가 아니어서 뺐습니다. 섭취량을 정하지 못하면 intake를 넣지 않고 '확인 필요'로 두세요.`,
        });
        const rest = Object.fromEntries(
          Object.entries(item.detail).filter(([field]) => field !== "intake"),
        );
        item = { ...item, detail: rest };
        if (item.status !== "not_mentioned") lower(REASONS.intakeUnknown);
      }
    }

    // 검사 5: 재가 제공시간 합 ≤ 방문 시간 (분 칸 형식 포함). 틀린 값은 합에 넣지 않고 확인 필요로 둔다.
    if (key === "support" && ctx.careType === "home") {
      const minutes = checkSupportMinutes(item.detail, visitMinutes);
      for (const problem of minutes.problems) problems.push({ ...problem, item_key: key });
      // 서버가 합 이유를 붙이면 AI가 따로 쓴 같은 뜻의 이유는 뺀다(이유가 두 번 보이지 않게)
      if (minutes.reasons.some((reason) => reason.startsWith(REASONS.supportMinutesExceed))) {
        const keep = (text: string, same: RegExp) =>
          text
            .split(";")
            .map((part) => part.trim())
            .filter((part) => part && !same.test(part))
            .join("; ");
        item = {
          ...item,
          reason: keep(item.reason, /제공\s*시간.*(합|초과|넘)|합.*방문\s*시간/),
          reason_native: keep(item.reason_native, /tổng thời gian/i),
        };
      }
      for (const reason of minutes.reasons) lower(reason);
    }

    // 검사 9(인지 변화): 재가 인지기능 변화상태는 비교가 있을 때만. 비교 없이 '관찰'이면 '확인 필요'로 두고
    // detail.trend도 뺀다(관리자가 M2에서 정함). 시설(제16호)에는 변화상태 칸이 없어 보지 않는다.
    if (key === "cognition" && ctx.careType === "home" && !compared) {
      if (item.detail.trend !== undefined) {
        const rest = Object.fromEntries(
          Object.entries(item.detail).filter(([field]) => field !== "trend"),
        );
        item = { ...item, detail: rest };
      }
      if (item.status === "observed") {
        problems.push({
          code: "trend_without_comparison",
          item_key: key,
          message:
            "원문에 비교 표현이 없어 인지기능 변화상태를 정할 수 없습니다. '확인 필요'로 두고 reason에 이유를 쓰세요.",
        });
        lower(REASONS.trendWithoutComparison);
      }
    }

    // 검사 10: 불편감 표현에 피부·몸에 보이는 변화가 있는데 '관찰'이면 '확인 필요'
    if (
      key === "discomfort" &&
      item.status === "observed" &&
      hasVisibleSign(`${item.value_ko}\n${item.evidence}`)
    ) {
      problems.push({
        code: "visible_sign_observed",
        item_key: key,
        message:
          "피부·몸에 보이는 변화(발적·상처·멍·부기 등)는 '확인 필요'로 두고 reason에 이유를 쓰세요.",
      });
      lower(REASONS.visibleSign);
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
// AI 규칙 v1.1.3 '멈춤 규칙' 3번, 검사 1. 검사 1 실패 때도 원문은 보여 주므로 transcriptKo를 넘긴다.
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
