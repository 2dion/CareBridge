import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Native, NativeLanguageProvider } from "@/components/mobile/native";
import { mockHelperAnswer } from "@/lib/demo/helper";
import type { NativeLang } from "@/lib/i18n/languages";
import {
  conversationsKey,
  helperHistoryKey,
  loadHelperHistory,
  loadMockConversations,
  saveMockConversation,
  type StorageLike,
  type StoredMessage,
} from "./history";

function storage(): StorageLike {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function translation(message: StoredMessage, language: NativeLang) {
  if (message.from !== "bot" || message.state !== "done") throw new Error("합성 답 없음");
  return renderToStaticMarkup(
    <NativeLanguageProvider language={language}>
      <Native recordLanguage={message.answer.nativeLang}>{message.answer.native}</Native>
    </NativeLanguageProvider>,
  );
}

describe("저장한 Mock 도우미 답의 언어별 병기(#354)", () => {
  it.each(["zh", "mn", "en"] as const)(
    "%s 답을 다시 읽으면 같은 언어에서만 번역을 보인다",
    (language) => {
      const s = storage();
      const answer = mockHelperAnswer("식사를 안 드셔요", language);
      saveMockConversation(s, "synthetic", "conversation", [
        { id: 1, from: "me", text: "합성 질문", at: "2026-11-07T00:00:00Z" },
        { id: 2, from: "bot", state: "done", answer },
      ]);
      const reply = loadMockConversations(s, "synthetic")[0].messages[1];
      expect(reply).toMatchObject({ answer: { nativeLang: language, ko: answer.ko } });
      expect(translation(reply, language)).toContain(`lang="${language}"`);
      expect(translation(reply, "vi")).toBe("");
      expect(translation(reply, "ko")).toBe("");
      expect(translation(reply, language)).toContain(`lang="${language}"`);
    },
  );

  it.each(["vi-key", "missing", "unknown"] as const)(
    "옛 저장 답(%s)을 다른 언어 번역으로 표시하지 않는다",
    (format) => {
      const s = storage();
      const answer = {
        ko: "합성 한국어 답",
        source: null,
        found: true,
        ...(format === "vi-key" ? { vi: "Trả lời" } : { native: "Trả lời" }),
        ...(format === "unknown" ? { nativeLang: "unsupported" } : {}),
      };
      const messages = [
        { id: 1, from: "me", text: "합성 질문", at: "2026-11-07T00:00:00Z" },
        { id: 2, from: "bot", state: "done", answer },
      ];
      s.setItem(helperHistoryKey("legacy"), JSON.stringify(messages));
      s.setItem(
        conversationsKey("legacy"),
        JSON.stringify([
          {
            id: "conversation",
            title: "합성 질문",
            last_message_at: "2026-11-07T00:00:00Z",
            message_count: 1,
            messages,
          },
        ]),
      );
      for (const reply of [
        loadHelperHistory(s, "legacy")[1],
        loadMockConversations(s, "legacy")[0].messages[1],
      ]) {
        expect(reply).toMatchObject({
          answer: { ko: "합성 한국어 답", nativeLang: format === "vi-key" ? "vi" : "ko" },
        });
        expect(translation(reply, "zh")).toBe("");
        expect(translation(reply, "en")).toBe("");
        expect(translation(reply, "vi")).toBe(
          format === "vi-key" ? '<span class="native" lang="vi">Trả lời</span>' : "",
        );
      }
    },
  );
});
