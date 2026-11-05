import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { patchItem, type ItemPatchDeps } from "./item-patch";
import { createItemPatchDeps } from "./item-patch-supabase";
import { createReturnTranslationDeps } from "./return-translation-supabase";
import type { RecordRow } from "./transition";

// 이슈 #336: 항목 고치기·되돌린 사유 번역의 언어는 기록을 만든 때 언어(records.native_lang)이고, 지금 프로필 언어가 아니다.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/ai/translate", () => ({ translateShort: vi.fn() }));
vi.mock("@/lib/security/rate-limit-supabase", () => ({ enforceQuota: vi.fn(async () => null) }));

type Row = Record<string, unknown> | null;

/** 표마다 한 줄을 돌려주는 사용자 권한 가짜. 읽은 표와 고른 칸을 남긴다 */
function fakeUser(rows: Record<string, Row>, userId = "worker-1") {
  const reads: { table: string; columns: string }[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: (table: string) => ({
      select: (columns: string) => {
        reads.push({ table, columns });
        return { eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null }) }) };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, reads };
}

// 서버 전용 클라이언트로는 언어를 읽지 않아야 한다
const adminThatMustNotRead = {
  from: (table: string) => {
    throw new Error(`서버 권한으로 읽음: ${table}`);
  },
} as unknown as SupabaseClient;

// 기록 언어 ≠ 지금 프로필 언어
const CASES = [
  ["vi", "ko"],
  ["ko", "vi"],
  ["zh", "vi"],
] as const;

const draft: RecordRow = { id: "rec-1", status: "draft", worker_id: "worker-1" };
const submitted: RecordRow = { ...draft, status: "submitted" };
const worker = { id: "worker-1", role: "worker" as const };
const reviewer = { id: "reviewer-1", role: "reviewer" as const };

beforeEach(() => {
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(createSupabaseAdminClient).mockReset();
  vi.mocked(createSupabaseAdminClient).mockReturnValue(adminThatMustNotRead);
});

describe("item-patch-supabase translationLang", () => {
  it.each(CASES)(
    "기록 %s·프로필 %s → %s, 작성자·관리자 모두 records만 읽음",
    async (recordLang, profileLang) => {
      for (const [user, record] of [
        [worker, draft],
        [reviewer, submitted],
      ] as const) {
        const { client, reads } = fakeUser({
          records: { native_lang: recordLang },
          profiles: { role: user.role, native_lang: profileLang },
        });
        vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
        const deps = await createItemPatchDeps();
        expect(await deps.translationLang(record, user)).toBe(recordLang);
        expect(reads).toEqual([{ table: "records", columns: "native_lang" }]);
      }
    },
  );

  it("관리자가 기록을 RLS로 못 읽으면 null(번역 건너뜀, 오류 없음)", async () => {
    const { client } = fakeUser({ records: null, profiles: { native_lang: "vi" } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
    const deps = await createItemPatchDeps();
    expect(await deps.translationLang(submitted, reviewer)).toBeNull();
  });
});

describe("patchItem 번역 언어", () => {
  function deps(
    lang: "ko" | "vi" | "zh" | null,
    user: typeof worker | typeof reviewer = worker,
  ): ItemPatchDeps {
    return {
      currentUser: vi.fn(async () => user),
      findRecord: vi.fn(async () => (user.role === "worker" ? draft : submitted)),
      currentValueKo: vi.fn(async () => "점심 조금 드심"),
      update: vi.fn(async () => ({ ok: true as const })),
      translationLang: vi.fn(async () => lang),
      translate: vi.fn(async () => "번역"),
      saveTranslation: vi.fn(async () => ({ ok: true as const })),
      readItem: vi.fn(async () => ({ item_key: "meal", value_ko: "점심 절반 드심" })),
      recheckSupport: vi.fn(async () => null),
    };
  }

  it.each(["vi", "zh"] as const)("기록 언어 %s면 그 언어로 번역해 저장", async (lang) => {
    for (const user of [worker, reviewer]) {
      const d = deps(lang, user);
      const r = await patchItem("rec-1", "meal", { value_ko: "점심 절반 드심" }, d);
      expect(r.status).toBe(200);
      expect(d.translate).toHaveBeenCalledWith("점심 절반 드심", lang);
      expect(d.saveTranslation).toHaveBeenCalled();
    }
  });

  it.each([["ko"], [null]] as const)("기록 언어가 %s면 번역하지 않음", async (lang) => {
    const d = deps(lang);
    const r = await patchItem("rec-1", "meal", { value_ko: "점심 절반 드심" }, d);
    expect(r.status).toBe(200);
    expect(d.translate).not.toHaveBeenCalled();
    expect(d.saveTranslation).not.toHaveBeenCalled();
  });
});

describe("return-translation-supabase", () => {
  it.each(CASES)(
    "기록 %s·프로필 %s → findRecord는 %s, currentUser는 언어를 읽지 않음",
    async (recordLang, profileLang) => {
      const { client, reads } = fakeUser({
        records: {
          id: "rec-1",
          status: "returned",
          worker_id: "worker-1",
          return_reason: "사유",
          return_reason_native: "",
          native_lang: recordLang,
        },
        profiles: { role: "worker", native_lang: profileLang },
      });
      vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
      const d = await createReturnTranslationDeps();
      expect(await d.currentUser()).toEqual({ id: "worker-1", role: "worker" });
      expect((await d.findRecord("rec-1"))?.native_lang).toBe(recordLang);
      const profileRead = reads.find((r) => r.table === "profiles");
      expect(profileRead?.columns).not.toContain("native_lang");
    },
  );

  it("모르는 언어 값은 ko(번역 없음)", async () => {
    const { client } = fakeUser({
      records: {
        id: "rec-1",
        status: "returned",
        worker_id: "worker-1",
        return_reason: "사유",
        return_reason_native: "",
        native_lang: "xx",
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
    const d = await createReturnTranslationDeps();
    expect((await d.findRecord("rec-1"))?.native_lang).toBe("ko");
  });
});
