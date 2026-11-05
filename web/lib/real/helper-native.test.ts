import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealActions } from "./actions";

afterEach(() => vi.unstubAllGlobals());

describe("도우미 이전 답의 화면 모국어 이름(#258)", () => {
  it.each(["vi", "native"])("서버의 %s 응답을 native로 읽는다", async (key) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          conversation: { id: "synthetic", title: "합성 질문" },
          messages: [
            {
              id: "message",
              question: "합성 질문",
              created_at: "2026-11-05T00:00:00Z",
              answer: {
                ko: "합성 답",
                [key]: "합성 번역",
                source: null,
                found: true,
              },
            },
          ],
          next_before: null,
        }),
      ),
    );
    const actions = createRealActions({} as SupabaseClient, async () => {});
    const result = await actions.helperMessages();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.messages[0].answer.native).toBe("합성 번역");
  });
});
