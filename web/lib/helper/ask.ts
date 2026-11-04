// ⑤ 도우미 답(W6): 교재 매뉴얼(manual_sections)과 용어 목록(glossary)에서 찾은 내용만으로 답한다. 답한 질문은 helper_messages에 남긴다(이슈 #218).
// 근거: 문서/설계/ai규칙-v2.0.4.md '도우미·번역 규칙' W6 1~7, 문서/설계/데이터구조-v2.3.3.md '공통 계약' helper/ask
// DB·Claude 호출은 HelperDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.
// 이슈 #122: 교재 검색과 search_glossary는 한국어만 맞으므로, 한글이 없는 질문(베트남어 등)은 먼저 한국어로 옮겨 검색한다.
// 건강·안전 안내 문구는 모델에 맡기지 않고 서버가 낱말 검사로 붙인다(질문 언어와 상관없이).

import type { Role } from "@/lib/auth/signup";
import { type RoleNames, roleNames } from "@/lib/demo/roles";
import { languageNameKo, type NativeLang } from "@/lib/i18n/languages";
import { isNotKorean } from "@/lib/records/item-patch";
import type { ApiResult } from "@/lib/records/transition";

import { conversationTitle } from "./conversations";
import { excerptSection, queryTerms } from "./manual-rank";
import type { ConversationRef } from "./messages";

export type ManualSection = { chapter: string; title: string; page: string; body: string };
export type GlossaryTerm = {
  matched_expression: string;
  term_ko: string;
  /** 작성자 모국어 고정 번역(search_glossary의 term_native). 그 언어 번역이 없으면 빈값 */
  term_native: string;
  plain_ko: string;
  chapter: string;
  page: string;
};
/** native = 작성자 모국어 답. API 출력에는 옛 이름 vi도 같은 값으로 함께 보낸다(이슈 #259 전환 기간) */
export type HelperAnswer = { ko: string; native: string; source: string | null; found: boolean };

/** helper_messages에 넣는 1행(질문 1개 + 답 1개). org_id·id·created_at은 DB가 채운다 */
export type HelperMessageRow = {
  worker_id: string;
  /** 대화(helper_conversations.id, 이슈 #251). DB가 대화의 작성자와 같은지 검사한다 */
  conversation_id: string;
  question: string;
  question_ko: string;
  answer_ko: string;
  answer_native: string;
  source: string;
  found: boolean;
  safety: boolean;
};

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
  /** lang: 작성자 모국어. 그 언어의 고정 번역(term_native)을 함께 받는다 */
  searchGlossary(question: string, lang: NativeLang): Promise<GlossaryTerm[]>;
  /** 한글이 없는 질문을 한국어로 옮기고 교재 검색용 핵심 낱말을 뽑는다(가벼운 모델 한 번). 키가 없으면 null */
  translateQuestion(question: string): Promise<{ text: string; keywords: string[] } | null>;
  /** 가벼운 모델 한 번 호출. 키가 없으면 null */
  askClaude(system: string, user: string): Promise<string | null>;
  /** 답한 질문을 helper_messages에 넣는다(서버 전용). 넣지 못하면 null — 답은 그대로 돌려준다 */
  saveMessage(row: HelperMessageRow): Promise<{ id: string; created_at: string } | null>;
  /** 내 대화 하나(로그인한 사람 권한 + worker_id). 남의 것이거나 없으면 null(이슈 #251) */
  findConversation(conversationId: string, workerId: string): Promise<ConversationRef | null>;
  /** 새 대화를 만든다(서버 전용). 제목은 첫 질문 앞 30자. 만들지 못하면 null */
  createConversation(workerId: string, title: string): Promise<ConversationRef | null>;
  /**
   * 같은 기관·같은 모국어 작성자가 같은 질문(검색용 한국어, 빈칸·문장부호 무시)을 물어 교재에서 찾은 답이 있으면
   * 그 답(서버 전용 find_helper_answer). 없으면 null(이슈 #229)
   */
  findSavedAnswer(workerId: string, questionKo: string): Promise<HelperAnswer | null>;
};

export const MAX_QUESTION_CHARS = 500;

/** 질문 형식이 맞는지(빈 글·500자 초과가 아님). 라우트가 호출 제한을 세기 전에 본다(이슈 #279) */
export function isValidHelperQuestion(body: unknown): boolean {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const question = typeof input.question === "string" ? input.question.trim() : "";
  return question.length > 0 && question.length <= MAX_QUESTION_CHARS;
}

// 교재에서 찾지 못하면 상식으로 채우지 않는다(W6 2번).
// 묻는 곳은 기관에 맞춘 이름: 일반 기관 관리자(người quản lý), 교육용 기관 강사(giảng viên)(이슈 #180)
export function notFoundAnswer(names: RoleNames = roleNames(false)): HelperAnswer {
  return {
    ko: `교재에서 찾지 못했어요. ${names.reviewer}에게 물어보세요.`,
    native: `Mình không tìm thấy nội dung này trong giáo trình. Vui lòng hỏi ${names.reviewerVi}.`,
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
    native: `Hãy báo ngay cho ${names.reviewerVi}.`,
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
    "숨쉬기",
    "숨 쉬기",
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

/** 안전 안내 문구를 ko·native 맨 앞에 붙인다. 모델이 이미 썼으면 두 번 붙이지 않는다. native가 비어 있으면 그대로 둔다. */
export function withSafetyNotice(
  answer: HelperAnswer,
  notice: { ko: string; native: string } = SAFETY_NOTICE,
): HelperAnswer {
  const ko = answer.ko.includes(notice.ko) ? answer.ko : `${notice.ko} ${answer.ko}`.trim();
  const native =
    answer.native === "" || answer.native.includes(notice.native)
      ? answer.native
      : `${notice.native} ${answer.native}`.trim();
  return { ...answer, ko, native };
}

export function helperSystemPrompt(nativeLang: NativeLang) {
  // 언어 이름은 언어 목록(web/lib/i18n/languages.ts)에서 넣는다(이슈 #259)
  const name = languageNameKo(nativeLang);
  const nativeRule =
    nativeLang === "ko"
      ? 'native는 ""로 둔다.'
      : `native에는 ko의 ${name} 번역을 쓴다. 교재 용어는 [용어]의 괄호 안 ${name}를 그대로 쓰고 다른 말로 옮기지 않는다.`;
  return `너는 외국인 요양보호사를 돕는 도우미다. 아래 [교재]와 [용어]에 있는 내용만으로 답한다.
1. 답은 [교재]·[용어]에 있는 내용만 쓴다. 상식·일반 조언·짐작을 보태지 않는다.
2. [교재]·[용어]에 답이 없으면 found=false로 두고 ko·native는 ""로 둔다. 대신할 조언을 쓰지 않는다.
3. 사투리·일상 표현 풀이는 '짐작'이라고 밝히고, 여러 뜻이 가능하면 모두 쓴다.
4. 기록을 고치거나 대신 쓰지 않는다. 건강·안전 보고 안내는 서버가 붙이므로 쓰지 않는다.
5. 쉬운 한국어로 3문장 이내로 짧게 쓴다. ${nativeRule}
6. source에는 답에 쓴 교재의 장·절·쪽을 쓴다.
다른 말 없이 JSON 한 개로만 답한다: {"ko":"","native":"","source":"","found":true}`;
}

export function helperUserMessage(
  question: string,
  sections: ManualSection[],
  terms: GlossaryTerm[],
  originalQuestion?: string,
  keywords: readonly string[] = [],
) {
  // 절 전체 대신 질문 낱말이 든 문단과 앞뒤 문단만, 절당 1,500자까지(이슈 #229). 출처는 그대로
  const searchTerms = [...queryTerms(question), ...keywords];
  const manual = sections
    .map(
      (s) =>
        `- ${s.chapter} ${s.title}${s.page ? ` (${s.page}쪽)` : ""}\n${excerptSection(s.body, searchTerms)}`,
    )
    .join("\n");
  const glossary = terms
    .map(
      (t) =>
        `- ${t.matched_expression} → ${t.term_ko}${t.term_native ? ` (${t.term_native})` : ""} ${t.plain_ko} [${t.chapter}${t.page ? ` ${t.page}쪽` : ""}]`,
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
    // found=false면 모델이 쓴 ko·native는 버리고 고정 문구만 쓴다(W6 2번)
    if (!parsed.found) return NOT_FOUND;
    // 옛 프롬프트로 답한 vi 칸도 받아 준다(전환 기간)
    const native =
      typeof parsed.native === "string"
        ? parsed.native
        : typeof parsed.vi === "string"
          ? parsed.vi
          : "";
    return {
      ko: parsed.ko,
      native,
      source: typeof parsed.source === "string" && parsed.source ? parsed.source : null,
      found: true,
    };
  } catch {
    return null;
  }
}

// POST /api/helper/ask — 작성자. 입력 question, conversation_id(없으면 새 대화).
// 출력 ko·native(옛 이름 vi도 같은 값)·source·found + id·created_at(저장한 행, 저장이 실패하면 null) + conversation_id(새 대화를 만들다 실패하면 null)
export async function askHelper(body: unknown, deps: HelperDeps): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return { status: 401, body: { error: "not_signed_in" } };
  if (user.role !== "worker") return { status: 403, body: { error: "not_record_worker" } };

  if (!isValidHelperQuestion(body)) return { status: 400, body: { error: "invalid_input" } };
  const input = body as Record<string, unknown>;
  const question = (input.question as string).trim();
  // 이어 묻는 대화는 내 것인지 먼저 확인한다. 아니면 답을 만들지도 저장하지도 않는다(이슈 #251)
  const requestedConversation =
    typeof input.conversation_id === "string" && input.conversation_id.trim()
      ? input.conversation_id.trim()
      : null;
  let conversation: ConversationRef | null = null;
  if (requestedConversation) {
    conversation = await deps.findConversation(requestedConversation, user.id);
    if (!conversation) return { status: 404, body: { error: "conversation_not_found" } };
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
  // 200으로 답하는 길은 모두 여기를 지난다. 답한 질문만(교재에서 못 찾은 답 포함) 남기고, 실패 응답은 남기지 않는다.
  const finish = async (answer: HelperAnswer): Promise<ApiResult> => {
    const base = answer.found ? answer : notFound;
    const shown = localized(
      safety ? withSafetyNotice(base, safetyNotice(names)) : base,
      user.nativeLang,
    );
    // 새 대화는 첫 질문을 저장할 때 만든다(빈 대화 없음). 못 만들면 저장도 건너뛰고 답만 준다
    if (!conversation) {
      conversation = await createQuietly(deps, user.id, conversationTitle(question));
    }
    const saved = conversation
      ? await saveQuietly(deps, {
          worker_id: user.id,
          conversation_id: conversation.id,
          question,
          question_ko: questionKo !== question ? questionKo : "",
          answer_ko: shown.ko,
          answer_native: shown.native,
          source: shown.source ?? "",
          found: shown.found,
          safety,
        })
      : null;
    return {
      status: 200,
      // vi는 옛 칸 이름. 화면이 native로 옮길 때까지 같은 값을 함께 보낸다(이슈 #259)
      body: {
        ...shown,
        vi: shown.native,
        id: saved?.id ?? null,
        created_at: saved?.created_at ?? null,
        conversation_id: conversation?.id ?? null,
      },
    };
  };

  // 같은 기관에서 같은 질문에 교재에서 찾은 답이 이미 있으면 Claude를 부르지 않는다(W6 9번, 이슈 #229).
  // 이번 질문도 새 행으로 남기고, 안전 안내는 위 finish가 다시 붙인다
  const reused = await deps.findSavedAnswer(user.id, questionKo);
  if (reused?.found) return finish(reused);

  const [sections, terms] = await Promise.all([
    deps.searchManual(questionKo, keywords),
    deps.searchGlossary(questionKo, user.nativeLang),
  ]);
  if (sections.length === 0 && terms.length === 0) return finish(notFound);

  const system = helperSystemPrompt(user.nativeLang);
  const message = helperUserMessage(questionKo, sections, terms, question, keywords);
  // 형식이 틀리면 한 번 다시 요청한다(기술 선택 v1.1)
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await deps.askClaude(system, message);
    if (raw === null) return { status: 503, body: { error: "ai_not_configured" } };
    const answer = parseHelperAnswer(raw);
    if (answer) return finish(answer);
  }
  return { status: 502, body: { error: "helper_failed" } };
}

// 저장이 실패해도 작성자는 답을 받아야 하므로 오류는 서버 기록에만 남기고 null을 돌려준다
async function createQuietly(deps: HelperDeps, workerId: string, title: string) {
  try {
    return await deps.createConversation(workerId, title);
  } catch (error) {
    console.error("helper_conversations 만들기 실패", error);
    return null;
  }
}

async function saveQuietly(deps: HelperDeps, row: HelperMessageRow) {
  try {
    return await deps.saveMessage(row);
  } catch (error) {
    console.error("helper_messages 저장 실패", error);
    return null;
  }
}

const localized = (answer: HelperAnswer, lang: NativeLang) =>
  lang === "ko" ? { ...answer, native: "" } : answer;
