import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getBlockedNames } from "./blocked-names";
import { validateDraft, ITEM_KEYS, type Draft } from "./validate-draft";

vi.mock("server-only", () => ({}));

// 서버 전용 RPC의 반환과 오류를 흉내 낸다. 이름은 시나리오의 가상 인물이다.
function fakeClient(
  rows: { name: string | null }[] | null,
  error: { message: string } | null = null,
) {
  const calls: unknown[][] = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve({ data: rows, error });
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("getBlockedNames", () => {
  it("같은 기관 profiles.name을 읽는다", async () => {
    const { client, calls } = fakeClient([{ name: "마이" }, { name: "박 사회복지사" }]);
    await expect(getBlockedNames(client, "record-1", "worker-1")).resolves.toEqual([
      "마이",
      "박 사회복지사",
    ]);
    expect(calls).toEqual([
      ["record_blocked_names", { p_record_id: "record-1", p_worker_id: "worker-1" }],
    ]);
  });

  it("빈 이름과 중복은 뺀다", async () => {
    const { client } = fakeClient([
      { name: " 마이 " },
      { name: "마이" },
      { name: "" },
      { name: null },
    ]);
    await expect(getBlockedNames(client, "record-1", "worker-1")).resolves.toEqual(["마이"]);
  });

  it("읽기에 실패하면 던진다 (검사를 건너뛰지 않음)", async () => {
    const { client } = fakeClient(null, { message: "boom" });
    await expect(getBlockedNames(client, "record-1", "worker-1")).rejects.toThrow("boom");
  });

  it("validateDraft에 넘기면 직원 이름이 든 항목이 걸린다", async () => {
    const { client } = fakeClient([{ name: "박 사회복지사" }]);
    const blockedNames = await getBlockedNames(client, "record-1", "worker-1");
    const transcript = "박 사회복지사님이 오셔서 같이 보셨어요.";
    const draft: Draft = {
      transcript_ko: transcript,
      items: ITEM_KEYS.map((key) => ({
        item_key: key,
        value_ko: key === "notes" ? "박 사회복지사와 함께 확인함" : "",
        value_native: "",
        status: key === "notes" ? "observed" : "not_mentioned",
        evidence: key === "notes" ? transcript : "",
        reason: "",
        reason_native: "",
        detail: {},
      })),
      form_fields: {},
    };
    const result = validateDraft(draft, { transcript, careType: "facility", blockedNames });
    expect(result.passed).toBe(false);
  });
});
