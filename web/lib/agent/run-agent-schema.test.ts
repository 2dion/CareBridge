import { describe, expect, it, vi } from "vitest";

import { AGENT_TOOLS, DRAFT_SCHEMA, runAgent, type AgentDeps, type AgentInput } from "./run-agent";
import { ITEM_KEYS } from "./validate-draft";

const input: AgentInput = {
  transcript: "점심은 죽 반 넘게 드셨어요.",
  careType: "facility",
  nativeLang: "vi",
  context: { transcript: "점심은 죽 반 넘게 드셨어요.", careType: "facility", blockedNames: [] },
};

describe("draft 스키마 (10/28 실제 시험 뒤)", () => {
  it("validate_draft·return_draft의 draft는 items 9개 배열과 item_key enum을 요구함", () => {
    for (const name of ["validate_draft", "return_draft"]) {
      const tool = AGENT_TOOLS.find((t) => t.name === name)!;
      const draft = (tool.input_schema.properties as { draft: typeof DRAFT_SCHEMA }).draft;
      expect(draft.properties.items.minItems).toBe(9);
      expect(draft.properties.items.maxItems).toBe(9);
      expect([...draft.properties.items.items.properties.item_key.enum]).toEqual([...ITEM_KEYS]);
      expect([...draft.required]).toEqual(["transcript_ko", "items", "form_fields"]);
    }
  });

  it("items가 배열이 아니면 문제 목록과 함께 expected_shape를 돌려줌", async () => {
    const badDraft = { transcript_ko: "", items: { meal: { value_ko: "x" } }, form_fields: {} };
    const deps: AgentDeps = {
      callClaude: vi
        .fn()
        .mockResolvedValueOnce({
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "validate_draft",
              input: { draft: badDraft, why: "검사" },
            },
          ],
          tokens: 10,
        })
        .mockResolvedValue({ content: [], tokens: 1 }),
      searchGlossary: vi.fn(async () => []),
      saveDraft: vi.fn(async () => ({ downgraded: [] })),
      logStep: vi.fn(async () => {}),
      now: () => 0,
    };
    await runAgent(input, deps);
    const logged = vi.mocked(deps.logStep).mock.calls[0][0];
    expect(logged.result_summary).toContain("invalid_shape");
    expect(logged.result_summary).toContain("expected_shape");
  });
});
