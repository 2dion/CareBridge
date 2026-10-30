import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createRealActions } from "./actions";

function setup(linkFails: "response" | "throw" | false, reloadFails = false) {
  const create = vi.fn(async () => ({ data: { id: "created-resident" }, error: null }));
  const link = vi.fn(async () => {
    if (linkFails === "throw") throw new Error("network");
    return { error: linkFails ? { message: "link failed" } : null };
  });
  const client = {
    from: (table: string) =>
      table === "residents"
        ? { insert: () => ({ select: () => ({ single: create }) }) }
        : { insert: link },
  } as unknown as SupabaseClient;
  const reload = vi.fn(async () => {
    if (reloadFails) throw new Error("reload failed");
  });
  return { actions: createRealActions(client, reload), create };
}

describe("어르신 생성 뒤 후속 실패", () => {
  it.each(["response", "throw"] as const)(
    "담당 연결 실패(%s)에도 생성 id와 보완 안내를 돌려준다",
    async (failure) => {
      const { actions, create } = setup(failure);
      const result = await actions.addResident("김가상", "facility", {
        workerIds: ["worker"],
        startDate: "2026-10-30",
      });
      expect(result).toMatchObject({ ok: true, data: { id: "created-resident" } });
      if (result.ok) expect(result.warnings[0]).toContain("담당 연결");
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it("목록 재조회 실패를 생성 실패로 돌리지 않는다", async () => {
    const { actions } = setup(false, true);
    const result = await actions.addResident("김가상", "facility");
    expect(result).toMatchObject({ ok: true, data: { id: "created-resident" } });
    if (result.ok) expect(result.warnings).toEqual([expect.stringContaining("새로 고쳐")]);
  });
});
