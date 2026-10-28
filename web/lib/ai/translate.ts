import "server-only";

import type { NativeLang } from "@/lib/auth/signup";
import { getAiMode, getAiModels } from "@/lib/config";

import { getClaudeClient } from "./claude";

// ④ 짧은 번역: 고친 항목 재번역(AI 규칙 v1.1.1). Agent 없이 가벼운 모델 한 번 호출.
// 정해진 JSON으로 받고, 형식이 틀리면 한 번 다시 요청한다(기술 선택 v1.1).
// Mock 모드는 빈 문자열을 돌려준다. 빈칸은 번역 완료가 아니다(결정 2026-10-27-피그마상충점).

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

export async function translateShort(textKo: string, lang: NativeLang): Promise<string> {
  if (lang === "ko" || textKo.trim() === "") return "";
  if (getAiMode() === "mock") return "";

  const client = getClaudeClient();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: getAiModels().light,
      max_tokens: 1024,
      system: systemPrompt(lang),
      messages: [{ role: "user", content: textKo }],
    });
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    const translated = parseTranslation(text);
    if (translated) return translated;
  }
  throw new Error("translation_failed");
}
