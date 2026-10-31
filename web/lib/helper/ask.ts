// ⑤ 도우미 답(W6): 교재 매뉴얼(manual_sections)과 용어 목록(glossary)에서 찾은 내용만으로 답한다. 답은 저장하지 않는다.
// 근거: 문서/설계/ai규칙-v1.1.5.md '도우미·번역 규칙' W6 1~7, 문서/설계/데이터구조-v1.7.md '공통 계약' helper/ask
// DB·Claude 호출은 HelperDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.
// 이슈 #122: 교재 검색과 search_glossary는 한국어만 맞으므로, 한글이 없는 질문(베트남어 등)은 먼저 한국어로 옮겨 검색한다.
// 건강·안전 안내 문구는 모델에 맡기지 않고 서버가 낱말 검사로 붙인다(질문 언어와 상관없이).

import type { NativeLang, Role } from "@/lib/auth/signup";
import { type RoleNames, roleNames } from "@/lib/demo/roles";
import { isNotKorean } from "@/lib/records/item-patch";
import type { ApiResult } from "@/lib/records/transition";

export type ManualSection = { chapter: string; title: string; page: string; body: string };
export type GlossaryTerm = {
  matched_expression: string;
  term_ko: string;
  term_vi: string;
  plain_ko: string;
  chapter: string;
  page: string;
};
export type HelperAnswer = { ko: string; vi: string; source: string | null; found: boolean };

export type HelperDeps = {
  currentUser(): Promise<{
    id: string;
    role: Role;
    nativeLang: NativeLang;
    /** 교육용 기관(organizations.is_training)이면 고정 안내에 '강사'를 쓴다(이슈 #180) */
    isTraining?: boolean;
  } | null>;
  /** keywords: 번역할 때 AI가 뽑은 핵심 낱말(이슈 #219). 한국어 질문은 빈 배열 */
  searchManual(question: string, keywords: string[]): Promise<ManualSection[]>;
  searchGlossary(question: string): Promise<GlossaryTerm[]>;
  /** 한글이 없는 질문을 한국어로 옮기고 교재 검색용 핵심 낱말을 뽑는다(가벼운 모델 한 번). 키가 없으면 null */
  translateQuestion(question: string): Promise<{ text: string; keywords: string[] } | null>;
  /** 가벼운 모델 한 번 호출. 키가 없으면 null */
  askClaude(system: string, user: string): Promise<string | null>;
};

export const MAX_QUESTION_CHARS = 500;

// 교재에서 찾지 못하면 상식으로 채우지 않는다(W6 2번).
// 묻는 곳은 기관에 맞춘 이름: 일반 기관 관리자(người quản lý), 교육용 기관 강사(giảng viên)(이슈 #180)
export function notFoundAnswer(names: RoleNames = roleNames(false)): HelperAnswer {
  return {
    ko: `교재에서 찾지 못했어요. ${names.reviewer}에게 물어보세요.`,
    vi: `Mình không tìm thấy nội dung này trong giáo trình. Vui lòng hỏi ${names.reviewerVi}.`,
    source: null,
    found: false,
  };
}

/** 일반 기관 기준 문구(관리자) */
export const NOT_FOUND: HelperAnswer = notFoundAnswer();

// 건강·안전 질문이면 교재 답보다 먼저 보고 안내(W6 3번). 용어집 v1.0: 관리자 = người quản lý, 강사 = giảng viên
export function safetyNotice(names: RoleNames = roleNames(false)) {
  return {
    ko: `${names.reviewer}에게 바로 보고하세요.`,
    vi: `Hãy báo ngay cho ${names.reviewerVi}.`,
  };
}

/** 일반 기관 기준 문구(관리자) */
export const SAFETY_NOTICE = safetyNotice();

// 낙상·호흡·질식·의식·통증·출혈·투약 사고(질식은 이슈 #220). 한국어와 베트남어 낱말을 모두 본다(원문 질문과 번역한 질문 둘 다 검사).
export const SAFETY_KEYWORDS = {
  ko: [
    "낙상",
    "넘어",
    "쓰러",
    "호흡",
    "숨이",
    "숨을",
    "질식",
    "사레",
    "목에 걸",
    "의식",
    "통증",
    "아파",
    "아프",
    "출혈",
    "피가",
    "약을 두 번",
    "약 두 번",
    "약을 잘못",
    "약 잘못",
    "과다",
  ],
  vi: [
    "ngã",
    "té",
    "khó thở",
    "ngạt",
    "nghẹn",
    "nghẹt thở",
    "sặc",
    "bất tỉnh",
    "hôn mê",
    "ngất",
    "lơ mơ",
    "đau",
    "chảy máu",
    "ra máu",
    "thuốc hai lần",
    "thuốc 2 lần",
    "nhầm thuốc",
    "quá liều",
  ],
};

/** 질문(원문·번역)에 건강·안전 낱말이 하나라도 있으면 true */
export function isSafetyQuestion(...texts: string[]) {
  const haystack = texts.map((t) => t.normalize("NFC").toLowerCase()).join("\n");
  return [...SAFETY_KEYWORDS.ko, ...SAFETY_KEYWORDS.vi].some((word) =>
    haystack.includes(word.normalize("NFC").toLowerCase()),
  );
}

/** 안전 안내 문구를 ko·vi 맨 앞에 붙인다. 모델이 이미 썼으면 두 번 붙이지 않는다. vi가 비어 있으면 그대로 둔다. */
export function withSafetyNotice(
  answer: HelperAnswer,
  notice: { ko: string; vi: string } = SAFETY_NOTICE,
): HelperAnswer {
  const ko = answer.ko.includes(notice.ko) ? answer.ko : `${notice.ko} ${answer.ko}`.trim();
  const vi =
    answer.vi === "" || answer.vi.includes(notice.vi)
      ? answer.vi
      : `${notice.vi} ${answer.vi}`.trim();
  return { ...answer, ko, vi };
}

export function helperSystemPrompt(nativeLang: NativeLang) {
  const viRule =
    nativeLang === "vi"
      ? "vi에는 ko의 베트남어 번역을 쓴다. 교재 용어는 [용어]의 괄호 안 베트남어를 그대로 쓰고 다른 말로 옮기지 않는다."
      : 'vi는 ""로 둔다.';
  return `너는 외국인 요양보호사를 돕는 도우미다. 아래 [교재]와 [용어]에 있는 내용만으로 답한다.
1. 답은 [교재]·[용어]에 있는 내용만 쓴다. 상식·일반 조언·짐작을 보태지 않는다.
2. [교재]·[용어]에 답이 없으면 found=false로 두고 ko·vi는 ""로 둔다. 대신할 조언을 쓰지 않는다.
3. 사투리·일상 표현 풀이는 '짐작'이라고 밝히고, 여러 뜻이 가능하면 모두 쓴다.
4. 기록을 고치거나 대신 쓰지 않는다. 건강·안전 보고 안내는 서버가 붙이므로 쓰지 않는다.
5. 쉬운 한국어로 짧게 쓴다. ${viRule}
6. source에는 답에 쓴 교재의 장·절·쪽을 쓴다.
다른 말 없이 JSON 한 개로만 답한다: {"ko":"","vi":"","source":"","found":true}`;
}

export function helperUserMessage(
  question: string,
  sections: ManualSection[],
  terms: GlossaryTerm[],
  originalQuestion?: string,
) {
  const manual = sections
    .map((s) => `- ${s.chapter} ${s.title}${s.page ? ` (${s.page}쪽)` : ""}\n${s.body}`)
    .join("\n");
  const glossary = terms
    .map(
      (t) =>
        `- ${t.matched_expression} → ${t.term_ko} (${t.term_vi}) ${t.plain_ko} [${t.chapter}${t.page ? ` ${t.page}쪽` : ""}]`,
    )
    .join("\n");
  // 질문을 한국어로 옮겨 검색했으면 원문도 함께 건넨다(뜻이 어긋났을 때 모델이 바로잡게)
  const original =
    originalQuestion && originalQuestion !== question ? `\n\n[질문 원문]\n${originalQuestion}` : "";
  return `[교재]\n${manual || "(없음)"}\n\n[용어]\n${glossary || "(없음)"}\n\n[질문]\n${question}${original}`;
}

export function parseHelperAnswer(raw: string): HelperAnswer | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof parsed.ko !== "string" || typeof parsed.found !== "boolean") return null;
    // found=false면 모델이 쓴 ko·vi는 버리고 고정 문구만 쓴다(W6 2번)
    if (!parsed.found) return NOT_FOUND;
    return {
      ko: parsed.ko,
      vi: typeof parsed.vi === "string" ? parsed.vi : "",
      source: typeof parsed.source === "string" && parsed.source ? parsed.source : null,
      found: true,
    };
  } catch {
    return null;
  }
}

// POST /api/helper/ask — 작성자. 입력 question. 출력 ko·vi·source·found
export async function askHelper(body: unknown, deps: HelperDeps): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return { status: 401, body: { error: "not_signed_in" } };
  if (user.role !== "worker") return { status: 403, body: { error: "not_record_worker" } };

  const question =
    body &&
    typeof body === "object" &&
    typeof (body as { question?: unknown }).question === "string"
      ? (body as { question: string }).question.trim()
      : "";
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return { status: 400, body: { error: "invalid_input" } };
  }

  // 한글이 없는 질문(베트남어 등)은 한국어로 옮겨 검색한다. 키가 없으면(null) 원문 그대로 검색한다.
  const translated = isNotKorean(question) ? await deps.translateQuestion(question) : null;
  const questionKo = translated?.text.trim() || question;
  const keywords = translated?.keywords ?? [];
  // 안전 안내는 모델 답과 상관없이 서버가 붙인다(W6 3번). 원문과 번역 둘 다 검사한다.
  const safety = isSafetyQuestion(question, questionKo);
  // 교육용 기관이면 고정 안내의 '관리자'를 '강사'로(이슈 #180)
  const names = roleNames(Boolean(user.isTraining));
  const notFound = notFoundAnswer(names);
  const finish = (answer: HelperAnswer): ApiResult => {
    const base = answer.found ? answer : notFound;
    return {
      status: 200,
      body: localized(safety ? withSafetyNotice(base, safetyNotice(names)) : base, user.nativeLang),
    };
  };

  const [sections, terms] = await Promise.all([
    deps.searchManual(questionKo, keywords),
    deps.searchGlossary(questionKo),
  ]);
  if (sections.length === 0 && terms.length === 0) return finish(notFound);

  const system = helperSystemPrompt(user.nativeLang);
  const message = helperUserMessage(questionKo, sections, terms, question);
  // 형식이 틀리면 한 번 다시 요청한다(기술 선택 v1.1)
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await deps.askClaude(system, message);
    if (raw === null) return { status: 503, body: { error: "ai_not_configured" } };
    const answer = parseHelperAnswer(raw);
    if (answer) return finish(answer);
  }
  return { status: 502, body: { error: "helper_failed" } };
}

const localized = (answer: HelperAnswer, lang: NativeLang) =>
  lang === "ko" ? { ...answer, vi: "" } : answer;
