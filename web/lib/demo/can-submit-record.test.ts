import { describe, expect, it } from "vitest";

import { canSubmit, type Item } from "./state";
import { canSubmitRecord, createDemoDb, type DemoRecord, groupItems } from "./store";

// 이슈 #236: AI가 다시 쓴 항목(source = worker, 미확인)도 작성자가 확인해야 전송한다
const base = Object.values(createDemoDb("2026-10-31").records)[0] as DemoRecord;
const ready = (patch: Partial<DemoRecord["items"][number]> = {}): DemoRecord => ({
  ...base,
  status: "draft",
  draftState: "ready",
  items: base.items.map((item, index) => ({
    ...item,
    status: "observed" as const,
    source: "ai" as const,
    confirmed_by_worker: true,
    ...(index === 0 ? patch : {}),
  })),
});

describe("canSubmitRecord", () => {
  it("모두 confirmed_by_worker면 전송 가능", () => {
    expect(canSubmitRecord(ready())).toBe(true);
    expect(canSubmitRecord(ready({ source: "worker" }))).toBe(true);
  });

  it("source = worker만으로는 인정하지 않는다", () => {
    expect(canSubmitRecord(ready({ source: "worker", confirmed_by_worker: false }))).toBe(false);
  });

  it("source = ai 미확인도 막는다", () => {
    expect(canSubmitRecord(ready({ confirmed_by_worker: false }))).toBe(false);
  });
});

describe("canSubmit·groupItems", () => {
  it("state.canSubmit도 source = worker만으로 인정하지 않는다", () => {
    const item = { status: "observed", source: "worker", confirmed_by_worker: false } as Item;
    expect(canSubmit([item])).toBe(false);
  });

  it("미확인 source = worker 항목은 확인할 묶음에 남는다", () => {
    const record = ready({ source: "worker", confirmed_by_worker: false });
    expect(groupItems(record.items, record).pending).toHaveLength(1);
  });
});
