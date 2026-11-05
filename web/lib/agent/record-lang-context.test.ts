import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildValidateContext } from "./agent-run";
import { saveValidatedDraft } from "./draft-repository";
import { validateDraft } from "./validate-draft";

// 이슈 #336: 서버 검사 이유 번역 언어는 기록을 만든 때 언어(records.native_lang)이고, 지금 프로필 언어가 아니다.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/claude", () => ({ getClaudeClient: vi.fn() }));
vi.mock("./blocked-names", () => ({ getBlockedNames: vi.fn(async () => []) }));
vi.mock("./validate-draft", async (original) => ({
  ...(await original<typeof import("./validate-draft")>()),
  validateDraft: vi.fn(() => ({ fixed: { items: [] }, downgraded: [], problems: [] })),
}));

type Row = Record<string, unknown> | null;

/** 표마다 한 줄을 돌려주는 가짜. 읽은 표 이름을 남긴다 */
function fakeClient(rows: Record<string, Row>) {
  const tables: string[] = [];
  const from = (table: string) => {
    tables.push(table);
    const result = { data: rows[table] ?? null, error: null };
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "in", "order"]) chain[name] = () => chain;
    chain.single = async () => result;
    chain.maybeSingle = async () => result;
    chain.then = (done: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(done);
    return chain;
  };
  const client = {
    from,
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getUser: async () => ({ data: { user: { id: "w1" } }, error: null }) },
  } as unknown as SupabaseClient;
  return { client, tables };
}

const record = (lang: string) => ({
  id: "rec-1",
  worker_id: "w1",
  transcript: "점심 반 그릇",
  form_type: 16,
  visit_start: null,
  visit_end: null,
  native_lang: lang,
});

// 기록 언어 ≠ 지금 프로필 언어
const CASES = [
  ["vi", "ko"],
  ["ko", "vi"],
  ["zh", "vi"],
] as const;

beforeEach(() => vi.mocked(validateDraft).mockClear());

describe("saveValidatedDraft 기록 언어 (이슈 #336)", () => {
  it.each(CASES)("기록 %s·프로필 %s → 검사 언어는 %s", async (recordLang, profileLang) => {
    const { client: user, tables } = fakeClient({
      records: record(recordLang),
      profiles: { native_lang: profileLang },
    });
    const { client: server } = fakeClient({});
    await saveValidatedDraft(user, server, "rec-1", { items: [] });
    expect(vi.mocked(validateDraft).mock.calls[0][1].nativeLang).toBe(recordLang);
    expect(tables).not.toContain("profiles");
  });

  it("모르는 언어 값은 ko(이유 번역 없음)", async () => {
    const { client: user } = fakeClient({ records: record("xx") });
    const { client: server } = fakeClient({});
    await saveValidatedDraft(user, server, "rec-1", { items: [] });
    expect(vi.mocked(validateDraft).mock.calls[0][1].nativeLang).toBe("ko");
  });
});

describe("buildValidateContext 기록 언어 (이슈 #336)", () => {
  it.each(CASES)("기록 %s·프로필 %s → 문맥 언어는 %s", async (recordLang, profileLang) => {
    const { client: user, tables } = fakeClient({
      records: { native_lang: recordLang },
      profiles: { native_lang: profileLang },
    });
    const { client: server } = fakeClient({});
    const ctx = await buildValidateContext(
      user,
      server,
      { id: "rec-1", form_type: 16, visit_start: null, visit_end: null },
      "w1",
      "원문",
    );
    expect(ctx.nativeLang).toBe(recordLang);
    expect(tables).not.toContain("profiles");
  });

  it("기록을 읽지 못하면 ko(번역 없음)", async () => {
    const { client: user } = fakeClient({ records: null });
    const { client: server } = fakeClient({});
    const ctx = await buildValidateContext(
      user,
      server,
      { id: "rec-1", form_type: 12, visit_start: null, visit_end: null },
      "w1",
      "원문",
    );
    expect(ctx.nativeLang).toBe("ko");
  });
});
