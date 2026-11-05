import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createSupportCheckDeps } from "./support-check-supabase";

vi.mock("server-only", () => ({}));

// records·record_items만 흉내 낸다. profiles를 읽으면 실패해 '현재 프로필 언어'를 쓰지 않음을 확인한다.
function fakeUser(recordLang: string) {
  const tables: string[] = [];
  const client = {
    from: (table: string) => {
      tables.push(table);
      if (table === "records")
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  form_type: 12,
                  visit_start: "2026-11-05T01:00:00Z",
                  visit_end: "2026-11-05T02:00:00Z",
                  form_fields: {},
                  native_lang: recordLang,
                },
              }),
            }),
          }),
        };
      if (table === "record_items")
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    item_key: "support",
                    value_ko: "목욕 보조",
                    status: "observed",
                    reason: "",
                    reason_native: "",
                    detail: {},
                  },
                ],
              }),
            }),
          }),
        };
      throw new Error(`읽으면 안 되는 표: ${table}`);
    },
  };
  return { client: client as unknown as SupabaseClient, tables };
}

describe("제공 지원 재검사의 번역 언어 (이슈 #336)", () => {
  it.each(["vi", "ko", "zh"])(
    "기록을 만든 때 언어 %s를 쓰고 profiles는 읽지 않는다",
    async (lang) => {
      const { client, tables } = fakeUser(lang);
      const target = await createSupportCheckDeps(client, client).readTarget("rec-1");
      expect(target?.nativeLang).toBe(lang);
      expect(tables).not.toContain("profiles");
    },
  );
});
