// 프롬프트 캐싱(Anthropic cache_control). Agent는 응답마다 같은 시스템 프롬프트·도구 정의와 앞 대화를 다시 보내므로,
// 캐시 표시를 두면 두 번째 응답부터 그 앞부분을 다시 계산하지 않는다(코디세이api-v1.0 §4·§7-5 '확인 필요').
// 코디세이가 캐싱을 넘기지 않아도 표시는 무시될 뿐 응답은 같다. 적중 여부는 usage의 cache_read_input_tokens로 본다.

import type { AgentMessage, ContentBlock, ToolResult } from "./run-agent";

export const CACHE = { type: "ephemeral" } as const;

export type CachedSystem = { type: "text"; text: string; cache_control: typeof CACHE }[];

/** 시스템 프롬프트를 캐시 표시가 붙은 글 블록으로. 도구 정의는 시스템 앞에 오므로 함께 캐시된다 */
export function cachedSystem(system: string): CachedSystem {
  return [{ type: "text", text: system, cache_control: CACHE }];
}

/** 마지막 메시지의 마지막 블록에 캐시 표시를 붙여, 다음 응답이 지금까지의 대화를 캐시에서 읽게 한다 */
export function withConversationCache(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  let content: AgentMessage["content"];
  if (typeof last.content === "string") {
    const block = { type: "text", text: last.content, cache_control: CACHE };
    content = [block as unknown as ContentBlock];
  } else {
    if (last.content.length === 0) return messages;
    const blocks = [...last.content] as unknown as (ContentBlock | ToolResult)[];
    const i = blocks.length - 1;
    blocks[i] = { ...blocks[i], cache_control: CACHE } as unknown as ContentBlock | ToolResult;
    content = blocks as unknown as AgentMessage["content"];
  }
  return [...messages.slice(0, -1), { ...last, content }];
}

/** 실제로 처리된 토큰 수(캐시에서 읽은 것·새로 캐시한 것 포함). 차감 토큰은 코디세이가 따로 계산한다 */
export function totalTokens(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}) {
  return (
    usage.input_tokens +
    usage.output_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}
