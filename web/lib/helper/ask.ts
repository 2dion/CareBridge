// ⑤ 도우미 답(W6): 교재 매뉴얼(manual_sections)과 용어 목록(glossary)에서 찾은 내용만으로 답한다. 답은 저장하지 않는다.
// 근거: 문서/설계/ai규칙-v1.1.1.md '도우미·번역 규칙' W6 1~6, 문서/설계/데이터구조-v1.6.3.md '공통 계약' helper/ask
// DB·Claude 호출은 HelperDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

import type { NativeLang, Role } from "@/lib/auth/signup";
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
  currentUser(): Promise<{ id: string; role: Role; nativeLang: NativeLang } | null>;
  searchManual(question: string): Promise<ManualSection[]>;
  searchGlossary(question: string): Promise<GlossaryTerm[]>;
  /** 가벼운 모델 한 번 호출. 키가 없으면 null */
  askClaude(system: string, user: string): Promise<string | null>;
};

export const MAX_QUESTION_CHARS = 500;

// 교재에서 찾지 못하면 상식으로 채우지 않는다(W6 2번)
export const NOT_FOUND: HelperAnswer = {
  ko: "교재에서 찾지 못했어요. 담당자에게 물어보세요.",
  vi: "Mình không tìm thấy nội dung này trong giáo trình. Vui lòng hỏi người phụ trách.",
  source: null,
  found: false,
};

export function helperSystemPrompt(nativeLang: NativeLang) {
  return `너는 외국인 요양보호사를 돕는 도우미다. 아래 [교재]와 [용어]에 있는 내용만으로 답한다.
1. 답은 [교재]·[용어]에 있는 내용만 쓴다. 없으면 found=false로 두고 상식으로 채우지 않는다.
2. 낙상, 호흡 곤란, 의식 변화, 심한 통증 같은 건강·안전 질문이면 답의 맨 앞에 "담당자에게 바로 보고하세요."를 쓴다.
3. 사투리·일상 표현 풀이는 '짐작'이라고 밝히고, 여러 뜻이 가능하면 모두 쓴다.
4. 기록을 고치거나 대신 쓰지 않는다.
5. 쉬운 한국어로 짧게 쓴다. ${nativeLang === "vi" ? "vi에는 그 베트남어 번역을 쓴다." : 'vi는 ""로 둔다.'}
6. source에는 답에 쓴 교재의 장·절·쪽을 쓴다.
다른 말 없이 JSON 한 개로만 답한다: {"ko":"","vi":"","source":"","found":true}`;
}

export function helperUserMessage(
  question: string,
  sections: ManualSection[],
  terms: GlossaryTerm[],
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
  return `[교재]\n${manual || "(없음)"}\n\n[용어]\n${glossary || "(없음)"}\n\n[질문]\n${question}`;
}

export function parseHelperAnswer(raw: string): HelperAnswer | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof parsed.ko !== "string" || typeof parsed.found !== "boolean") return null;
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

  const [sections, terms] = await Promise.all([
    deps.searchManual(question),
    deps.searchGlossary(question),
  ]);
  if (sections.length === 0 && terms.length === 0) {
    return { status: 200, body: localized(NOT_FOUND, user.nativeLang) };
  }

  const system = helperSystemPrompt(user.nativeLang);
  const message = helperUserMessage(question, sections, terms);
  // 형식이 틀리면 한 번 다시 요청한다(기술 선택 v1.1)
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await deps.askClaude(system, message);
    if (raw === null) return { status: 503, body: { error: "ai_not_configured" } };
    const answer = parseHelperAnswer(raw);
    if (answer) return { status: 200, body: localized(answer, user.nativeLang) };
  }
  return { status: 502, body: { error: "helper_failed" } };
}

const localized = (answer: HelperAnswer, lang: NativeLang) =>
  lang === "ko" ? { ...answer, vi: "" } : answer;
