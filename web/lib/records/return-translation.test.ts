import { describe, expect, it, vi } from "vitest";

import {
  translateReturnReason,
  type ReturnTranslationDeps,
  type ReturnedRecord,
} from "./return-translation";

const worker = { id: "worker-1", role: "worker" as const, nativeLang: "vi" as const };
const returned: ReturnedRecord = {
  id: "rec-1",
  status: "returned",
  worker_id: "worker-1",
  return_reason: "[식사] 섭취량을 다시 확인해 주세요",
  return_reason_native: "",
};

function fakeDeps(
  record: ReturnedRecord | null,
  overrides: Partial<ReturnTranslationDeps> = {},
): ReturnTranslationDeps {
  return {
    currentUser: vi.fn(async () => worker),
    findRecord: vi.fn(async () => record),
    translate: vi.fn(async () => "Hãy kiểm tra lại lượng ăn"),
    save: vi.fn(async (_id, _w, reason, native) => ({
      ok: true as const,
      row: { status: "returned", return_reason: reason, return_reason_native: native },
    })),
    ...overrides,
  };
}

describe("translateReturnReason", () => {
  it("작성자 언어로 번역해 저장하고 돌려줌", async () => {
    const deps = fakeDeps(returned);
    const r = await translateReturnReason("rec-1", deps);
    expect(deps.translate).toHaveBeenCalledWith(returned.return_reason, "vi");
    expect(deps.save).toHaveBeenCalledWith(
      "rec-1",
      "worker-1",
      returned.return_reason,
      "Hãy kiểm tra lại lượng ăn",
    );
    expect(r).toEqual({
      status: 200,
      body: {
        status: "returned",
        return_reason: returned.return_reason,
        return_reason_native: "Hãy kiểm tra lại lượng ăn",
      },
    });
  });

  it("이미 번역돼 있으면 번역하지 않고 그대로 돌려줌", async () => {
    const deps = fakeDeps({ ...returned, return_reason_native: "đã dịch" });
    const r = await translateReturnReason("rec-1", deps);
    expect(deps.translate).not.toHaveBeenCalled();
    expect(r.body.return_reason_native).toBe("đã dịch");
  });

  it("한국어 작성자는 번역하지 않음", async () => {
    const deps = fakeDeps(returned, {
      currentUser: vi.fn(async () => ({ ...worker, nativeLang: "ko" as const })),
    });
    expect((await translateReturnReason("rec-1", deps)).status).toBe(200);
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("Mock(빈 번역)이면 저장하지 않고 빈칸 그대로", async () => {
    const deps = fakeDeps(returned, { translate: vi.fn(async () => "") });
    const r = await translateReturnReason("rec-1", deps);
    expect(deps.save).not.toHaveBeenCalled();
    expect(r.body.return_reason_native).toBe("");
  });

  it("그사이 사유가 바뀌면(stale_reason) 새 사유로 한 번 더", async () => {
    const changed = { ...returned, return_reason: "[수면] 다시 확인" };
    const findRecord = vi.fn().mockResolvedValueOnce(returned).mockResolvedValueOnce(changed);
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "stale_reason" })
      .mockResolvedValueOnce({
        ok: true,
        row: {
          status: "returned",
          return_reason: changed.return_reason,
          return_reason_native: "x",
        },
      });
    const deps = fakeDeps(returned, { findRecord, save });
    const r = await translateReturnReason("rec-1", deps);
    expect(deps.translate).toHaveBeenLastCalledWith(changed.return_reason, "vi");
    expect(r.body.return_reason).toBe(changed.return_reason);
  });

  it("작성자가 아니면 403, returned가 아니면 409, 로그인 안 함 401, 못 보면 404", async () => {
    expect(
      (await translateReturnReason("rec-1", fakeDeps({ ...returned, worker_id: "other" }))).status,
    ).toBe(403);
    expect(
      (await translateReturnReason("rec-1", fakeDeps({ ...returned, status: "submitted" }))).status,
    ).toBe(409);
    expect(
      (
        await translateReturnReason(
          "rec-1",
          fakeDeps(returned, { currentUser: vi.fn(async () => null) }),
        )
      ).status,
    ).toBe(401);
    expect((await translateReturnReason("rec-1", fakeDeps(null))).status).toBe(404);
  });

  it("번역이 실패하면 502 translation_failed", async () => {
    const deps = fakeDeps(returned, {
      translate: vi.fn(async () => {
        throw new Error("translation_failed");
      }),
    });
    expect(await translateReturnReason("rec-1", deps)).toEqual({
      status: 502,
      body: { error: "translation_failed" },
    });
  });
});
