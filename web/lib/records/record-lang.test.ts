import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { readRecordNativeLang } from "./record-lang";

// records 한 줄만 돌려주는 가짜 클라이언트. 프로필은 아예 읽지 않는다.
function fakeClient(row: Record<string, unknown> | null) {
  const from = vi.fn((table: string) => {
    if (table !== "records") throw new Error(`records 밖의 표를 읽음: ${table}`);
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
    };
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

describe("readRecordNativeLang (이슈 #336)", () => {
  it.each(["vi", "ko", "zh", "mn", "en"])(
    "기록을 만든 때 언어 %s를 그대로 돌려준다",
    async (lang) => {
      const { client } = fakeClient({ native_lang: lang });
      expect(await readRecordNativeLang(client, "rec-1")).toBe(lang);
    },
  );

  it("profiles는 읽지 않는다(작성자가 모국어를 바꿔도 기록 언어는 그대로)", async () => {
    const { client, from } = fakeClient({ native_lang: "vi" });
    await readRecordNativeLang(client, "rec-1");
    expect(from.mock.calls.map(([table]) => table)).toEqual(["records"]);
  });

  it("볼 수 없는 기록은 null", async () => {
    const { client } = fakeClient(null);
    expect(await readRecordNativeLang(client, "rec-1")).toBeNull();
  });

  it("모르는 언어 값은 ko(번역 없음)로 읽어 엉뚱한 언어로 번역하지 않는다", async () => {
    const { client } = fakeClient({ native_lang: "xx" });
    expect(await readRecordNativeLang(client, "rec-1")).toBe("ko");
  });
});
