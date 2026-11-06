import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionError, createRealActions } from "./actions";

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

describe("안내문의 모국어 줄(이슈 #312)", () => {
  it("작성자 언어의 오류 문구를 쓰고, 한국어 작성자는 모국어 줄이 빈칸", () => {
    expect(actionError("note_required", undefined, "zh").native).toBe("请填写理由。");
    expect(actionError("note_required", undefined, "mn").native).toBe("Шалтгаанаа бичнэ үү.");
    expect(actionError("note_required", undefined, "en").native).toBe("Write the reason.");
    expect(actionError("note_required", undefined, "ko").native).toBe("");
  });

  it("언어를 안 주면 베트남어, 작성자 언어를 주면 그 언어를 따른다", () => {
    expect(actionError("note_required").native).not.toBe("");
    expect(actionError("note_required", undefined, "vi").native).toBe(
      actionError("note_required").native,
    );
    expect(actionError("note_required", undefined, "ko").native).toBe("");
  });

  it("createRealActions의 네트워크 오류도 nativeLang을 따른다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    const actions = createRealActions({} as SupabaseClient, async () => {}, { nativeLang: "zh" });
    const result = await actions.helperMessages();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.native).toBe("请检查网络连接后重试。");
  });
});
