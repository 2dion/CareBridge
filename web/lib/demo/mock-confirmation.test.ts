import { submitRecord as submitApi } from "@/lib/records/transition";
import { describe, expect, it } from "vitest";
import { canSubmit } from "./state";
import {
  canSubmitRecord,
  confirmItem,
  createDemoDb,
  mockVoiceAddition,
  submitRecord,
  workerEditItem,
  type DemoDb,
} from "./store";

const NOW = "2026-11-05T10:00:00+09:00";
function ready(status: "draft" | "returned" = "draft") {
  const db = createDemoDb("2026-11-05");
  const record = Object.values(db.records).find(
    (row) => row.draftState === "ready" && row.residentId === "kim",
  )!;
  record.status = status;
  record.items = record.items.map((item) => ({ ...item, confirmed_by_worker: true }));
  return { db, id: record.id };
}
function checkBlocked(db: DemoDb, id: string) {
  const record = db.records[id];
  expect(canSubmitRecord(record)).toBe(false);
  expect(canSubmit(record.items)).toBe(false);
  expect(submitRecord(db, id, NOW).records[id]).toEqual(record);
}

describe("Mock도 AI가 다시 정리한 항목의 작성자 확인을 받는다(#283)", () => {
  it.each(["draft", "returned"] as const)(
    "%s: 글 입력 후 확인 전에는 전송하지 않고 확인 후 전송한다",
    (status) => {
      const { db, id } = ready(status);
      const current = db.records[id].items.find((item) => item.item_key === "meal")!;
      current.resolution = "confirmed_by_reviewer";
      const next = workerEditItem(
        db,
        id,
        "meal",
        { value_ko: "식사를 절반 드심.", confirmed_by_worker: false },
        NOW,
      );
      const item = next.records[id].items.find((row) => row.item_key === "meal")!;
      expect(item.source).toBe("worker");
      expect(item.confirmed_by_worker).toBe(false);
      if (status === "returned") expect(item.resolution).toBeNull();
      checkBlocked(next, id);
      const restored = JSON.parse(JSON.stringify(next)) as DemoDb;
      checkBlocked(restored, id);
      const confirmed = confirmItem(restored, id, "meal", NOW);
      expect(canSubmitRecord(confirmed.records[id])).toBe(true);
      expect(submitRecord(confirmed, id, NOW).records[id].status).toBe("submitted");
      expect(db.records[id].items.find((row) => row.item_key === "meal")!.confirmed_by_worker).toBe(
        true,
      );
    },
  );

  it("음성 합성 결과도 확인 전이며 다른 항목의 확인 상태는 보존한다", () => {
    const { db, id } = ready("returned");
    const next = mockVoiceAddition(db, id, "meal", NOW)!;
    expect(next.records[id].items.find((item) => item.item_key === "meal")).toMatchObject({
      source: "worker",
      confirmed_by_worker: false,
      resolution: null,
    });
    expect(next.records[id].items.filter((item) => item.item_key !== "meal")).toEqual(
      db.records[id].items.filter((item) => item.item_key !== "meal"),
    );
    checkBlocked(next, id);
    expect(canSubmitRecord(confirmItem(next, id, "meal", NOW).records[id])).toBe(true);
  });

  it("시간·분을 직접 수정하면 기존처럼 추가 확인 없이 저장한다", () => {
    const { db, id } = ready();
    const next = workerEditItem(
      db,
      id,
      "visit_time",
      {
        value_ko: "09:00~10:00 방문",
        detail: { start: "09:00", end: "10:00" },
        confirmed_by_worker: true,
      },
      NOW,
    );
    expect(
      next.records[id].items.find((item) => item.item_key === "visit_time")!.confirmed_by_worker,
    ).toBe(true);
    expect(canSubmitRecord(next.records[id])).toBe(true);
  });

  it("미확인 확인 필요 항목도 전송을 막고, 확인한 확인 필요 항목은 관리자에게 보낸다", () => {
    const { db, id } = ready();
    const item = db.records[id].items[0];
    item.status = "needs_check";
    item.confirmed_by_worker = false;
    checkBlocked(db, id);
    const next = confirmItem(db, id, item.item_key, NOW);
    expect(canSubmitRecord(next.records[id])).toBe(true);
    expect(canSubmit(next.records[id].items)).toBe(true);
  });

  it("항목이 9개가 아니면 모두 확인해도 전송하지 않는다", () => {
    for (const count of [0, 8, 10]) {
      const { db, id } = ready();
      const items = db.records[id].items;
      db.records[id].items = count === 10 ? [...items, { ...items[0] }] : items.slice(0, count);
      checkBlocked(db, id);
    }
  });
});

it("전송 완료로 만든 합성 사례는 모두 작성자 확인을 마친 상태다", () => {
  const submitted = Object.values(createDemoDb("2026-11-05").records).filter(
    (record) => record.status === "submitted",
  );
  expect(submitted.length).toBeGreaterThan(0);
  expect(
    submitted.every(
      (record) =>
        record.items.length === 9 && record.items.every((item) => item.confirmed_by_worker),
    ),
  ).toBe(true);
});

describe("실제 전송 API 조건과 Mock의 일치", () => {
  it.each(["observed", "not_mentioned", "needs_check"] as const)(
    "%s: 확인 전·후의 전송 허용 결과가 같다",
    async (status) => {
      for (const confirmed of [false, true]) {
        const { db, id } = ready();
        db.records[id].items[0] = {
          ...db.records[id].items[0],
          status,
          source: "worker",
          confirmed_by_worker: confirmed,
        };
        let wrote = false;
        const result = await submitApi(id, {
          currentUser: async () => ({ id: "synthetic-worker", role: "worker" }),
          findRecord: async () => ({ id, worker_id: "synthetic-worker", status: "draft" }),
          listItems: async () => db.records[id].items,
          update: async () => {
            wrote = true;
            return { ok: true, row: { status: "submitted" } };
          },
          recheckSupport: async () => undefined,
        });
        expect(result.status === 200).toBe(canSubmitRecord(db.records[id]));
        expect(wrote).toBe(confirmed);
        if (!confirmed) expect(result.body.error).toBe("unconfirmed_items");
      }
    },
  );
});
