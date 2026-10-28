import { describe, expect, it } from "vitest";

import { CACHE, cachedSystem, totalTokens, withConversationCache } from "./prompt-cache";
import type { AgentMessage } from "./run-agent";

describe("프롬프트 캐싱", () => {
  it("시스템 프롬프트는 캐시 표시가 붙은 글 블록 하나", () => {
    expect(cachedSystem("규칙")).toEqual([{ type: "text", text: "규칙", cache_control: CACHE }]);
  });

  it("마지막 메시지의 마지막 블록에만 캐시 표시를 붙이고 원본은 바꾸지 않음", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "[받아쓴 글]" },
      { role: "assistant", content: [{ type: "text", text: "x" }] },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a", content: "1" },
          { type: "tool_result", tool_use_id: "b", content: "2" },
        ],
      },
    ];
    const out = withConversationCache(messages);
    expect(out[0]).toEqual(messages[0]);
    expect(out[1]).toEqual(messages[1]);
    const last = out[2].content as { cache_control?: unknown }[];
    expect(last[0]).not.toHaveProperty("cache_control");
    expect(last[1]).toMatchObject({ tool_use_id: "b", cache_control: CACHE });
    expect(messages[2].content).not.toContainEqual(
      expect.objectContaining({ cache_control: CACHE }),
    );
  });

  it("첫 메시지가 글이면 글 블록으로 바꿔 표시", () => {
    const out = withConversationCache([{ role: "user", content: "[받아쓴 글]" }]);
    expect(out[0].content).toEqual([{ type: "text", text: "[받아쓴 글]", cache_control: CACHE }]);
  });

  it("실제 토큰은 캐시 읽기·생성까지 더함", () => {
    expect(
      totalTokens({
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 2000,
        cache_read_input_tokens: 3000,
      }),
    ).toBe(5150);
    expect(totalTokens({ input_tokens: 10, output_tokens: 5 })).toBe(15);
  });
});
