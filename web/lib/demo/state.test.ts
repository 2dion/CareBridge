import { describe, expect, it } from "vitest";
import {
  applyMealAddition,
  canApprove,
  canSubmit,
  countUnresolved,
  createDemoState,
  itemOrder,
} from "./state";

describe("S-F01 Mock FE 상태", () => {
  it("S-F01 초안은 9개 항목과 2개의 확인 필요를 가진다", () => {
    const state = createDemoState();
    expect(state.draftPrepared).toBe(false);
    expect(state.items).toHaveLength(9);
    expect(state.items.map((item) => item.item_key)).toEqual(itemOrder.map((item) => item.key));
    expect(countUnresolved(state.items)).toBe(2);
    expect(canSubmit(state.items)).toBe(false);
  });

  it("식사 보완 후에도 피부 상태는 관리자 확인이 필요하다", () => {
    const state = applyMealAddition(createDemoState());
    expect(countUnresolved(state.items)).toBe(1);
    expect(state.items.find((item) => item.item_key === "meal")?.value_ko).toContain("1/2 미만");
    expect(state.transcript).toContain("죽 반 안 되게 드셨어요.");
    expect(state.items.find((item) => item.item_key === "discomfort")?.status).toBe("needs_check");
  });

  it("확인 필요는 제출을 허용하지만 미해결 상태로 승인할 수 없다", () => {
    const state = applyMealAddition(createDemoState());
    state.items = state.items.map((item) => ({
      ...item,
      confirmed: item.status !== "needs_check",
    }));
    expect(canSubmit(state.items)).toBe(true);
    state.status = "submitted";
    expect(canApprove(state)).toBe(false);
    state.items = state.items.map((item) =>
      item.item_key === "discomfort"
        ? { ...item, resolution: "confirmed_by_reviewer" as const }
        : item,
    );
    expect(canApprove(state)).toBe(true);
  });

  it("수정 필요 기록과 승인된 기록은 추가 승인할 수 없다", () => {
    const state = createDemoState();
    state.status = "returned";
    expect(canApprove(state)).toBe(false);
    state.status = "approved";
    expect(canApprove(state)).toBe(false);
  });

  it("승인한 기록은 다시 승인할 수 없다", () => {
    const state = createDemoState();
    state.status = "approved";
    expect(canApprove(state)).toBe(false);
  });
});
