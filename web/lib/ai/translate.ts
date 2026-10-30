import "server-only";

import type { NativeLang } from "@/lib/auth/signup";
import { getAiMode, getAiModels } from "@/lib/config";

import { getClaudeClient } from "./claude";

// ④ 짧은 번역: 고친 항목 재번역(AI 규칙 v1.1.3). Agent 없이 가벼운 모델 한 번 호출.
// 정해진 JSON으로 받고, 형식이 틀리면 한 번 다시 요청한다(기술 선택 v1.1).
// Mock 모드는 빈 문자열을 돌려준다. 빈칸은 번역 완료가 아니다(결정 2026-10-27-피그마상충점).
// 도우미 질문 번역(translateQuestionKo)도 같은 방식이다(이슈 #122).

const LANG_NAME: Record<Exclude<NativeLang, "ko">, string> = { vi: "베트남어" };

function systemPrompt(lang: Exclude<NativeLang, "ko">) {
  return [
    `너는 요양 돌봄 기록의 짧은 한국어 문장을 ${LANG_NAME[lang]}로 번역한다.`,
    "뜻을 더하거나 빼지 않는다.",
    '다른 말 없이 JSON 한 줄로만 답한다: {"text": "번역문"}',
  ].join("\n");
}

function parseTranslation(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { text?: unknown };
    return typeof parsed.text === "string" && parsed.text.trim() ? parsed.text.trim() : null;
  } catch {
    return null;
  }
}

/** 가벼운 모델에 한 번 묻고 {"text"}를 꺼낸다. 형식이 틀리면 한 번 다시 요청한다. */
async function translateOnce(system: string, content: string): Promise<string> {
  const client = getClaudeClient();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: getAiModels().light,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content }],
    });
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    const translated = parseTranslation(text);
    if (translated) return translated;
  }
  throw new Error("translation_failed");
}

export async function translateShort(textKo: string, lang: NativeLang): Promise<string> {
  if (lang === "ko" || textKo.trim() === "") return "";
  if (getAiMode() === "mock") return "";
  return translateOnce(systemPrompt(lang), textKo);
}

// 도우미(W6) 질문 번역(이슈 #122): 한글이 없는 질문(베트남어 등)을 한국어로 옮겨 교재·용어를 검색한다.
// 교재 검색(manual_sections)과 search_glossary는 한국어만 맞기 때문이다. Mock 모드는 null(번역 못 함).
const QUESTION_SYSTEM = [
  "너는 외국인 요양보호사가 한 질문을 한국어로 번역한다. 질문은 베트남어일 수 있다.",
  "뜻을 더하거나 빼지 않고, 답하지 않는다. 요양 용어는 한국 요양보호사 교재의 말을 쓴다(예: 신체활동지원, 체위변경, 낙상).",
  '다른 말 없이 JSON 한 줄로만 답한다: {"text": "한국어 질문"}',
].join("\n");

export async function translateQuestionKo(question: string): Promise<string | null> {
  if (question.trim() === "") return null;
  if (getAiMode() === "mock") return null;
  return translateOnce(QUESTION_SYSTEM, question);
}
