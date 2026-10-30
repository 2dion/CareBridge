import { describe, expect, it, vi } from "vitest";

import { createActionLock } from "./action-lock";

describe("W3 요청 중 버튼 처리 (#154)", () => {
  it("첫 요청이 끝나기 전에는 같은 버튼과 다른 저장 버튼의 요청도 막는다", async () => {
    let finish!: () => void;
    const deferred = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const changed = vi.fn();
    const lock = createActionLock(changed);
    const action = vi.fn(() => deferred);
    const first = lock.run("confirm:meal", action);
    expect(changed).toHaveBeenLastCalledWith("confirm:meal");
    await lock.run("confirm:meal", action);
    await lock.run("submit", action);
    expect(action).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(changed).toHaveBeenLastCalledWith(null);
    await lock.run("submit", async () => {});
    expect(changed.mock.calls.map(([name]) => name)).toEqual([
      "confirm:meal",
      null,
      "submit",
      null,
    ]);
  });

  it("통신 예외가 나도 잠금을 풀고 다시 시도할 수 있다", async () => {
    const changed = vi.fn();
    const lock = createActionLock(changed);
    await expect(
      lock.run("save", async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(changed).toHaveBeenLastCalledWith(null);
    const retry = vi.fn(async () => {});
    await lock.run("save", retry);
    expect(retry).toHaveBeenCalledOnce();
  });
});
