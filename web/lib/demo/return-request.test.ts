import { describe, expect, it } from "vitest";

import {
  createDemoDb,
  displayOrder,
  groupItems,
  itemLabel,
  requestedItemKeys,
  returnedRecords,
} from "./store";

const returned = () => ({
  ...returnedRecords(createDemoDb("2026-10-30"))[0],
  returnReason: "[수면, 식사, 식사] 내용을 다시 봐 주세요.",
});

describe("W3 수정 요청 항목 (#199)", () => {
  it("M2와 같은 항목 이름으로 찾고 별지 순서를 유지하며 중복을 없앤다", () => {
    const record = returned();
    const groups = groupItems(record.items, record);
    expect(requestedItemKeys(record)).toEqual(["meal", "sleep"]);
    expect(groups.requested.map((item) => item.item_key)).toEqual(["meal", "sleep"]);
    const all = Object.values(groups).flat();
    expect(all).toHaveLength(record.items.length);
    expect(new Set(all.map((item) => item.item_key)).size).toBe(record.items.length);
  });

  it("이미 확인한 항목도 위로 옮기지만 원본 확인 상태와 완료 개수를 보존한다", () => {
    const record = returned();
    record.items = record.items.map((item) => ({ ...item, confirmed_by_worker: true }));
    const before = structuredClone(record);
    const groups = groupItems(record.items, record);
    expect(groups.requested.every((item) => item.confirmed_by_worker)).toBe(true);
    expect(groups.done).toHaveLength(record.items.length - 2);
    expect(
      Object.values(groups)
        .flat()
        .filter((item) => item.confirmed_by_worker).length,
    ).toBe(record.items.length);
    expect(record).toEqual(before);
  });

  it.each([
    "식사를 다시 봐 주세요.",
    "[없는 항목] 다시 봐 주세요.",
    "[] 다시 봐 주세요.",
    "사유 중간 [식사]는 항목 칩이 아니에요.",
    "[식사량]은 식사와 다른 이름이에요.",
  ])("칩이나 정확한 항목 이름이 없으면 기존 분류를 유지한다: %s", (returnReason) => {
    const record = { ...returned(), returnReason };
    expect(groupItems(record.items, record)).toEqual(groupItems(record.items));
  });

  it("수정 필요가 아닌 기록은 옛 사유가 남아 있어도 배지를 붙이지 않는다", () => {
    for (const status of ["draft", "submitted", "approved"] as const) {
      expect(requestedItemKeys({ ...returned(), status })).toEqual([]);
    }
  });

  it("모든 항목 이름을 M2의 itemLabel과 같은 기준으로 읽는다", () => {
    const record = returned();
    record.returnReason = ` [${[...displayOrder]
      .reverse()
      .map((key) => itemLabel(key).ko)
      .join(", ")}] 사유`;
    expect(requestedItemKeys(record)).toEqual(displayOrder);
  });
});
