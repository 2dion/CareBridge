import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { DEFAULTS, getAiMode } from "@/lib/config";
import { MissingEnvError, MockModeError } from "@/lib/errors";

// 코디세이 공개 API(Anthropic 규격 /v1/messages)로 Claude를 부르는 클라이언트.
// 키는 Authorization: Bearer 로 보내야 해서 apiKey가 아니라 authToken을 쓴다(코디세이api-v1.0 §2).
// apiKey: null 은 ANTHROPIC_API_KEY가 환경에 있어도 x-api-key 헤더를 보내지 않게 한다.
export function getClaudeClient(): Anthropic {
  if (getAiMode() === "mock") throw new MockModeError("Claude");

  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (!authToken) throw new MissingEnvError("ANTHROPIC_AUTH_TOKEN");

  return new Anthropic({
    apiKey: null,
    authToken,
    baseURL: process.env.ANTHROPIC_BASE_URL || DEFAULTS.anthropicBaseUrl,
  });
}
