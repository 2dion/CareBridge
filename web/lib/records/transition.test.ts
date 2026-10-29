import { describe, expect, it, vi } from "vitest";

import {
  approveRecord,
  returnRecord,
  submitRecord,
  type ItemRow,
  type RecordRow,
  type TransitionDeps,
} from "./transition";

const KEYS = [
  "visit_time",
  "support",
  "meal",
  "sleep",
  "discomfort",
  "medication",
  "cognition",
  "notes",
  "next_check",
];

function items(overrides: Partial<Record<string, Partial<ItemRow>>> = {}): ItemRow[] {
  return KEYS.map((key) => ({
    item_key: key,
    status: "observed",
    source: "ai",
    confirmed: true,
    resolution: null,
    ...overrides[key],
  }));
}

const worker = { id: "worker-1", role: "worker" as const };
const reviewer = { id: "reviewer-1", role: "reviewer" as const };

function fakeDeps(
  record: RecordRow | null,
  overrides: Partial<TransitionDeps> = {},
): TransitionDeps {
  return {
    currentUser: vi.fn(async () => worker),
    findRecord: vi.fn(async () => record),
    listItems: vi.fn(async () => items()),
    update: vi.fn(async (_id, _from, patch) => ({ ok: true as const, row: { ...patch } })),
    ...overrides,
  };
}

const draft: RecordRow = { id: "rec-1", status: "draft", worker_id: "worker-1" };
const submitted: RecordRow = { ...draft, status: "submitted" };

describe("submitRecord", () => {
  it("9개 항목이 모두 확인되면 submitted로 바꿈", async () => {
    const deps = fakeDeps(draft);
    const r = await submitRecord("rec-1", deps);
    expect(r.status).toBe(200);
    expect(deps.update).toHaveBeenCalledWith(
      "rec-1",
      "draft",
      { status: "submitted" },
      "status, submitted_at",
    );
  });

  it("수정 필요(returned) 기록도 다시 전송할 수 있음", async () => {
    const r = await submitRecord("rec-1", fakeDeps({ ...draft, status: "returned" }));
    expect(r.status).toBe(200);
  });

  it("source = worker 항목은 confirmed가 아니어도 됨", async () => {
    const deps = fakeDeps(draft, {
      listItems: vi.fn(async () => items({ meal: { source: "worker", confirmed: false } })),
    });
    expect((await submitRecord("rec-1", deps)).status).toBe(200);
  });

  it("확인 안 된 항목이 있으면 409 unconfirmed_items와 항목 이름", async () => {
    const deps = fakeDeps(draft, {
      listItems: vi.fn(async () => items({ sleep: { confirmed: false } })),
    });
    expect(await submitRecord("rec-1", deps)).toEqual({
      status: 409,
      body: { error: "unconfirmed_items", items: ["sleep"] },
    });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("항목이 9개가 아니면 409 unconfirmed_items", async () => {
    const deps = fakeDeps(draft, { listItems: vi.fn(async () => items().slice(0, 8)) });
    expect((await submitRecord("rec-1", deps)).body.error).toBe("unconfirmed_items");
  });

  it("'확인 필요'가 남아도 보낼 수 있음", async () => {
    const deps = fakeDeps(draft, {
      listItems: vi.fn(async () => items({ meal: { status: "needs_check" } })),
    });
    expect((await submitRecord("rec-1", deps)).status).toBe(200);
  });

  it("작성자가 아니면 403 not_record_worker", async () => {
    const deps = fakeDeps(draft, { currentUser: vi.fn(async () => reviewer) });
    expect((await submitRecord("rec-1", deps)).body.error).toBe("not_record_worker");
  });

  it("submitted 기록은 409 invalid_transition", async () => {
    expect((await submitRecord("rec-1", fakeDeps(submitted))).status).toBe(409);
  });

  it("로그인하지 않으면 401, 볼 수 없는 기록이면 404", async () => {
    expect(
      (await submitRecord("rec-1", fakeDeps(draft, { currentUser: vi.fn(async () => null) })))
        .status,
    ).toBe(401);
    expect((await submitRecord("rec-1", fakeDeps(null))).status).toBe(404);
  });

  it("그사이 상태가 바뀌어 0행이면 409 invalid_transition", async () => {
    const deps = fakeDeps(draft, {
      update: vi.fn(async () => ({ ok: false as const, error: "no_rows" })),
    });
    expect(await submitRecord("rec-1", deps)).toEqual({
      status: 409,
      body: { error: "invalid_transition" },
    });
  });
});

describe("approveRecord", () => {
  const asReviewer = (record: RecordRow | null, o: Partial<TransitionDeps> = {}) =>
    fakeDeps(record, { currentUser: vi.fn(async () => reviewer), ...o });

  it("정하지 않은 '확인 필요'가 없으면 approved로 바꿈", async () => {
    const deps = asReviewer(submitted, {
      listItems: vi.fn(async () =>
        items({
          meal: { status: "needs_check", resolution: "confirmed_by_reviewer" },
          sleep: { status: "needs_check", resolution: "omitted" },
        }),
      ),
    });
    const r = await approveRecord("rec-1", deps);
    expect(r.status).toBe(200);
    expect(deps.update).toHaveBeenCalledWith(
      "rec-1",
      "submitted",
      { status: "approved" },
      "status, approved_at",
    );
  });

  it("정하지 않은 '확인 필요'가 있으면 409와 남은 항목 목록 (원칙 3)", async () => {
    const deps = asReviewer(submitted, {
      listItems: vi.fn(async () =>
        items({ meal: { status: "needs_check" }, medication: { status: "needs_check" } }),
      ),
    });
    expect(await approveRecord("rec-1", deps)).toEqual({
      status: 409,
      body: { error: "unresolved_needs_check", items: ["meal", "medication"] },
    });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("DB 트리거가 unresolved_needs_check로 거절하면 남은 항목을 다시 읽어 돌려줌", async () => {
    const listItems = vi
      .fn()
      .mockResolvedValueOnce(items())
      .mockResolvedValueOnce(items({ cognition: { status: "needs_check" } }));
    const deps = asReviewer(submitted, {
      listItems,
      update: vi.fn(async () => ({ ok: false as const, error: "unresolved_needs_check" })),
    });
    expect(await approveRecord("rec-1", deps)).toEqual({
      status: 409,
      body: { error: "unresolved_needs_check", items: ["cognition"] },
    });
  });

  it("작성자는 403 reviewer_only", async () => {
    expect((await approveRecord("rec-1", fakeDeps(submitted))).body.error).toBe("reviewer_only");
  });

  it("submitted가 아니면 409 invalid_transition", async () => {
    expect((await approveRecord("rec-1", asReviewer(draft))).body.error).toBe("invalid_transition");
  });
});

describe("returnRecord", () => {
  const asReviewer = (record: RecordRow | null, o: Partial<TransitionDeps> = {}) =>
    fakeDeps(record, { currentUser: vi.fn(async () => reviewer), ...o });
  const reason = "[식사] 섭취량을 다시 확인해 주세요";

  it("한국어 사유만 저장하고 지난 번역은 비움", async () => {
    const deps = asReviewer(submitted);
    const r = await returnRecord("rec-1", { reason: `  ${reason} ` }, deps);
    expect(r.status).toBe(200);
    expect(deps.update).toHaveBeenCalledWith(
      "rec-1",
      "submitted",
      { status: "returned", return_reason: reason, return_reason_native: "" },
      "status, return_reason",
    );
  });

  it("사유가 비면 400 return_reason_required", async () => {
    for (const body of [{ reason: "  " }, {}, null]) {
      expect(await returnRecord("rec-1", body, asReviewer(submitted))).toEqual({
        status: 400,
        body: { error: "return_reason_required" },
      });
    }
  });

  it("작성자는 403 reviewer_only", async () => {
    expect((await returnRecord("rec-1", { reason }, fakeDeps(submitted))).status).toBe(403);
  });

  it("submitted가 아니면 409 invalid_transition", async () => {
    expect((await returnRecord("rec-1", { reason }, asReviewer(draft))).status).toBe(409);
  });

  it("DB 오류 키를 응답 코드로 옮김", async () => {
    const deps = asReviewer(submitted, {
      update: vi.fn(async () => ({ ok: false as const, error: "record_locked" })),
    });
    expect(await returnRecord("rec-1", { reason }, deps)).toEqual({
      status: 409,
      body: { error: "record_locked" },
    });
  });
});
