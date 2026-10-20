import "server-only";

import OpenAI from "openai";

import { DEFAULTS, getAiMode } from "@/lib/config";
import { MissingEnvError, MockModeError } from "@/lib/errors";

// 받아쓰기(STT)는 Groq의 OpenAI 호환 API로 부른다(문서/결정/2026-10-20-stt-groq.md).
// 주소·키·모델만 바꾸면 OpenAI 음성 인식으로 옮길 수 있게 OpenAI SDK를 쓴다.
export function getSttClient(): OpenAI {
  if (getAiMode() === "mock") throw new MockModeError("STT");

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new MissingEnvError("GROQ_API_KEY");

  return new OpenAI({
    apiKey,
    baseURL: process.env.STT_BASE_URL || DEFAULTS.sttBaseUrl,
  });
}

export function getSttModel(): string {
  return process.env.STT_MODEL || DEFAULTS.sttModel;
}
