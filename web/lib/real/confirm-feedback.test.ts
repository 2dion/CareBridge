import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealActions } from "./actions";

afterEach(() => vi.unstubAllGlobals());

const client = {} as SupabaseClient;
function setup(status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        status === 200 ? { confirmed_by_worker: true } : { error: "not_record_worker" },
        { status },
      ),
    ),
  );
  let release!: () => void;
  const reload = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const onConfirmed = vi.fn();
  const actions = createRealActions(client, reload, { onConfirmed });
  return { actions, reload, onConfirmed, release: () => release() };
}

describe("W3 확인 응답 뒤 화면 반영(#154)", () => {
  it("서버 성공 뒤 전체 재조회가 늦어도 확인 버튼 요청은 끝난다", async () => {
    const s = setup();
    const result = await s.actions.patchItem("synthetic-record", "meal", {
      confirmed_by_worker: true,
    });
    expect(result.ok).toBe(true);
    expect(s.onConfirmed).toHaveBeenCalledExactlyOnceWith("synthetic-record", "meal");
    expect(s.reload).toHaveBeenCalledTimes(1);
    s.release();
  });

  it("실패한 확인은 화면에 성공으로 반영하지 않는다", async () => {
    const s = setup(403);
    const request = s.actions.patchItem("synthetic-record", "meal", { confirmed_by_worker: true });
    await vi.waitFor(() => expect(s.reload).toHaveBeenCalledTimes(1));
    expect(s.onConfirmed).not.toHaveBeenCalled();
    s.release();
    expect((await request).ok).toBe(false);
  });

  it("내용 수정이 섞이면 기존대로 재조회를 기다린다", async () => {
    const s = setup();
    let finished = false;
    const request = s.actions
      .patchItem("synthetic-record", "meal", {
        value_ko: "합성 수정",
        confirmed_by_worker: true,
      })
      .then(() => {
        finished = true;
      });
    await vi.waitFor(() => expect(s.reload).toHaveBeenCalledTimes(1));
    expect(finished).toBe(false);
    expect(s.onConfirmed).not.toHaveBeenCalled();
    s.release();
    await request;
  });

  it("확인 저장 뒤 재조회 실패가 성공한 저장을 실패로 바꾸지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ confirmed_by_worker: true })),
    );
    const onConfirmed = vi.fn();
    const actions = createRealActions(
      client,
      async () => {
        throw new Error("read failed");
      },
      { onConfirmed },
    );
    expect(
      (await actions.patchItem("synthetic-record", "meal", { confirmed_by_worker: true })).ok,
    ).toBe(true);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});
