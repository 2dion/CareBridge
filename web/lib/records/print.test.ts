import { describe, expect, it, vi } from "vitest";

import { printRecord, type PrintDeps, type PrintItem, type PrintRecordRow } from "./print";

const approved: PrintRecordRow = {
  id: "rec-1",
  status: "approved",
  form_type: "12",
  form_fields: { total_minutes: 180 },
  care_date: "2026-10-27",
  visit_start: "14:00:00",
  visit_end: "17:00:00",
  is_training: false,
};

const items: PrintItem[] = [
  {
    item_key: "meal",
    value_ko: "점심 절반 드심",
    status: "observed",
    detail: {},
    resolution: null,
  },
];

function fakeDeps(record: PrintRecordRow | null, overrides: Partial<PrintDeps> = {}): PrintDeps {
  return {
    currentUser: vi.fn(async () => ({ id: "reviewer-1", role: "reviewer" as const })),
    findRecord: vi.fn(async () => record),
    listItems: vi.fn(async () => items),
    ...overrides,
  };
}

describe("printRecord", () => {
  it("승인한 기록의 항목·form_type·form_fields·verified·is_training을 돌려줌", async () => {
    const r = await printRecord("rec-1", fakeDeps({ ...approved, is_training: true }));
    expect(r).toEqual({
      status: 200,
      body: {
        id: "rec-1",
        care_date: "2026-10-27",
        visit_start: "14:00:00",
        visit_end: "17:00:00",
        form_type: "12",
        form_fields: { total_minutes: 180 },
        verified: "verified",
        is_training: true,
        items,
      },
    });
  });

  it("approved가 아니면 409 not_approved", async () => {
    const deps = fakeDeps({ ...approved, status: "submitted" });
    expect(await printRecord("rec-1", deps)).toEqual({
      status: 409,
      body: { error: "not_approved" },
    });
    expect(deps.listItems).not.toHaveBeenCalled();
  });

  it("작성자는 403 reviewer_only", async () => {
    const deps = fakeDeps(approved, {
      currentUser: vi.fn(async () => ({ id: "worker-1", role: "worker" as const })),
    });
    expect((await printRecord("rec-1", deps)).body.error).toBe("reviewer_only");
  });

  it("로그인하지 않으면 401, 볼 수 없는 기록이면 404", async () => {
    const noUser = fakeDeps(approved, { currentUser: vi.fn(async () => null) });
    expect((await printRecord("rec-1", noUser)).status).toBe(401);
    expect((await printRecord("rec-1", fakeDeps(null))).status).toBe(404);
  });
});
