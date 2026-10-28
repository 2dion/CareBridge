import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { saveAddedItem, saveItemTranslation } from "./draft-repository";

vi.mock("server-only", () => ({}));

// save_ai_item RPC의 인자와 오류 전달만 흉내 낸다. 권한·거절은 supabase/tests/save-ai-item.sql이 본다.
function fakeServer(error: { message: string } | null = null) {
  const calls: unknown[][] = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve({ data: error ? null : [{ item_key: "meal" }], error });
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("save_ai_item 래퍼", () => {
  it("재번역은 번역만 보낸다", async () => {
    const { client, calls } = fakeServer();
    await saveItemTranslation(client, "record-1", "meal", "worker-1", "죽 반 그릇", "Nửa bát cháo");
    expect(calls).toEqual([
      [
        "save_ai_item",
        {
          p_record_id: "record-1",
          p_item_key: "meal",
          p_actor_id: "worker-1",
          p_expected_value_ko: "죽 반 그릇",
          p_mode: "translation",
          p_item: { value_native: "Nửa bát cháo" },
        },
      ],
    ]);
  });

  it("항목 보태기는 item_key를 빼고 항목 칸을 보낸다", async () => {
    const { client, calls } = fakeServer();
    await saveAddedItem(client, "record-1", "worker-1", "", {
      item_key: "sleep",
      value_ko: "밤에 두 번 깸",
      value_native: "Thức dậy hai lần",
      status: "needs_check",
      evidence: "밤에 두 번",
      reason: "시간 확인 필요",
      reason_native: "Cần kiểm tra giờ",
      detail: {},
    });
    const args = calls[0][1] as { p_item_key: string; p_mode: string; p_item: object };
    expect(args.p_item_key).toBe("sleep");
    expect(args.p_mode).toBe("item");
    expect(args.p_item).not.toHaveProperty("item_key");
    expect(args.p_item).toHaveProperty("reason_native", "Cần kiểm tra giờ");
  });

  it("거절되면 던진다 (stale_item 등)", async () => {
    const { client } = fakeServer({ message: "stale_item" });
    await expect(
      saveItemTranslation(client, "record-1", "meal", "worker-1", "옛 글", "x"),
    ).rejects.toThrow("stale_item");
  });
});
