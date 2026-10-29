import { describe, expect, it, vi } from "vitest";

import { isNotKorean, parseItemPatch, patchItem, type ItemPatchDeps } from "./item-patch";
import type { RecordRow } from "./transition";

const worker = { id: "worker-1", role: "worker" as const };
const reviewer = { id: "reviewer-1", role: "reviewer" as const };
const draft: RecordRow = { id: "rec-1", status: "draft", worker_id: "worker-1" };
const submitted: RecordRow = { ...draft, status: "submitted" };

function fakeDeps(record: RecordRow | null, overrides: Partial<ItemPatchDeps> = {}): ItemPatchDeps {
  return {
    currentUser: vi.fn(async () => worker),
    findRecord: vi.fn(async () => record),
    currentValueKo: vi.fn(async () => "점심 조금 드심"),
    update: vi.fn(async () => ({ ok: true as const })),
    translationLang: vi.fn(async () => "vi" as const),
    translate: vi.fn(async () => "Ăn một nửa bữa trưa"),
    saveTranslation: vi.fn(async () => ({ ok: true as const })),
    readItem: vi.fn(async () => ({ item_key: "meal", value_ko: "점심 절반 드심" })),
    recheckSupport: vi.fn(async () => null),
    ...overrides,
  };
}

describe("parseItemPatch", () => {
  it("바꿀 칸만 고르고 value_ko 앞뒤 공백을 지움", () => {
    expect(
      parseItemPatch({ value_ko: " 점심 절반 드심 ", confirmed_by_worker: true, other: 1 }),
    ).toEqual({
      value_ko: "점심 절반 드심",
      confirmed_by_worker: true,
    });
  });

  it("형식이 틀리거나 바꿀 칸이 없으면 null", () => {
    for (const body of [
      null,
      [],
      {},
      { status: "done" },
      { confirmed_by_worker: "yes" },
      { resolution: "ok" },
      { detail: [] },
    ]) {
      expect(parseItemPatch(body)).toBeNull();
    }
  });

  it("resolution은 빈값(null)으로 되돌릴 수 있음", () => {
    expect(parseItemPatch({ resolution: null })).toEqual({ resolution: null });
  });
});

describe("patchItem", () => {
  it("작성자가 value_ko를 고치면 저장 → 번역 → save_ai_item 순서", async () => {
    const deps = fakeDeps(draft);
    const r = await patchItem("rec-1", "meal", { value_ko: "점심 절반 드심" }, deps);
    expect(r.status).toBe(200);
    expect(deps.update).toHaveBeenCalledWith("rec-1", "meal", { value_ko: "점심 절반 드심" });
    expect(deps.translate).toHaveBeenCalledWith("점심 절반 드심", "vi");
    expect(deps.saveTranslation).toHaveBeenCalledWith(
      "rec-1",
      "meal",
      "worker-1",
      "점심 절반 드심",
      "Ăn một nửa bữa trưa",
    );
  });

  it("[맞아요]만 누르면 번역하지 않음", async () => {
    const deps = fakeDeps(draft);
    expect((await patchItem("rec-1", "meal", { confirmed_by_worker: true }, deps)).status).toBe(
      200,
    );
    expect(deps.translate).not.toHaveBeenCalled();
  });

  // 이슈 #116: 작성자가 분이나 방문 시점을 고치면 저장 뒤 검사 5를 다시 한다
  it("작성자가 지원별 분을 고치면 저장 뒤 제공 지원을 다시 검사함", async () => {
    const deps = fakeDeps(draft);
    const minutes = { physical: 80, emotional: 60, housework: 60 };
    const r = await patchItem("rec-1", "support", { detail: { minutes } }, deps);
    expect(r.status).toBe(200);
    expect(deps.recheckSupport).toHaveBeenCalledWith("rec-1", "worker-1");
    const [updateOrder] = vi.mocked(deps.update).mock.invocationCallOrder;
    const [recheckOrder] = vi.mocked(deps.recheckSupport).mock.invocationCallOrder;
    expect(recheckOrder).toBeGreaterThan(updateOrder);
  });

  it("작성자가 방문 시점을 고쳐도 제공 지원을 다시 검사함", async () => {
    const deps = fakeDeps(draft);
    await patchItem("rec-1", "visit_time", { detail: { start: "14:00", end: "17:00" } }, deps);
    expect(deps.recheckSupport).toHaveBeenCalledWith("rec-1", "worker-1");
  });

  it("다른 항목을 고치거나 관리자가 고치면 다시 검사하지 않음", async () => {
    const worker = fakeDeps(draft);
    await patchItem("rec-1", "meal", { value_ko: "점심 절반 드심" }, worker);
    expect(worker.recheckSupport).not.toHaveBeenCalled();
    const manager = fakeDeps(submitted, { currentUser: vi.fn(async () => reviewer) });
    await patchItem("rec-1", "support", { detail: { minutes: { physical: 30 } } }, manager);
    expect(manager.recheckSupport).not.toHaveBeenCalled();
  });

  it("재검사가 실패해도 고친 내용은 저장된 채 200", async () => {
    const deps = fakeDeps(draft, {
      recheckSupport: vi.fn(async () => {
        throw new Error("stale_item");
      }),
    });
    const r = await patchItem("rec-1", "support", { detail: { minutes: { physical: 30 } } }, deps);
    expect(r.status).toBe(200);
  });

  it("작성자 언어가 한국어면 번역하지 않음", async () => {
    const deps = fakeDeps(draft, { translationLang: vi.fn(async () => "ko" as const) });
    await patchItem("rec-1", "meal", { value_ko: "점심 절반 드심" }, deps);
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("stale_item이면 새 글로 한 번 더 번역", async () => {
    const currentValueKo = vi
      .fn()
      .mockResolvedValueOnce("점심 조금 드심")
      .mockResolvedValueOnce("점심 다 드심");
    const saveTranslation = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "stale_item" })
      .mockResolvedValueOnce({ ok: true });
    const deps = fakeDeps(draft, { currentValueKo, saveTranslation });
    await patchItem("rec-1", "meal", { value_ko: "점심 절반 드심" }, deps);
    expect(deps.translate).toHaveBeenLastCalledWith("점심 다 드심", "vi");
    expect(saveTranslation).toHaveBeenCalledTimes(2);
  });

  it("번역이 실패해도 수정은 200", async () => {
    const deps = fakeDeps(draft, {
      translate: vi.fn(async () => {
        throw new Error("translation_failed");
      }),
    });
    expect((await patchItem("rec-1", "meal", { value_ko: "점심 절반 드심" }, deps)).status).toBe(
      200,
    );
    expect(deps.saveTranslation).not.toHaveBeenCalled();
  });

  it("관리자는 submitted에서 고치고 [기록 안 함]을 고름", async () => {
    const deps = fakeDeps(submitted, { currentUser: vi.fn(async () => reviewer) });
    const body = { resolution: "omitted", resolution_note: "원문에 없음" };
    expect((await patchItem("rec-1", "meal", body, deps)).status).toBe(200);
  });

  it("관리자가 고친 value_ko도 다시 번역", async () => {
    const deps = fakeDeps(submitted, { currentUser: vi.fn(async () => reviewer) });
    await patchItem("rec-1", "meal", { value_ko: "점심 절반 드심" }, deps);
    expect(deps.saveTranslation).toHaveBeenCalledWith(
      "rec-1",
      "meal",
      "reviewer-1",
      "점심 절반 드심",
      "Ăn một nửa bữa trưa",
    );
  });

  it("작성자가 resolution을 바꾸면 403 reviewer_only", async () => {
    const r = await patchItem("rec-1", "meal", { resolution: null }, fakeDeps(draft));
    expect(r).toEqual({ status: 403, body: { error: "reviewer_only" } });
  });

  it("관리자가 [맞아요]를 누르면 403 not_record_worker", async () => {
    const deps = fakeDeps(submitted, { currentUser: vi.fn(async () => reviewer) });
    expect((await patchItem("rec-1", "meal", { confirmed_by_worker: true }, deps)).body.error).toBe(
      "not_record_worker",
    );
  });

  it("submitted에서 작성자는 403, draft에서 다른 사람은 403", async () => {
    expect(
      (await patchItem("rec-1", "meal", { confirmed_by_worker: true }, fakeDeps(submitted))).status,
    ).toBe(403);
    const other = fakeDeps(draft, { currentUser: vi.fn(async () => reviewer) });
    expect((await patchItem("rec-1", "meal", { value_ko: "x" }, other)).status).toBe(403);
  });

  it("승인된 기록은 409 record_locked", async () => {
    const deps = fakeDeps({ ...draft, status: "approved" });
    expect((await patchItem("rec-1", "meal", { confirmed_by_worker: true }, deps)).body.error).toBe(
      "record_locked",
    );
  });

  it("항목 이름이 틀리면 400 invalid_item, 입력이 틀리면 400 invalid_input", async () => {
    expect(
      (await patchItem("rec-1", "mood", { confirmed_by_worker: true }, fakeDeps(draft))).body.error,
    ).toBe("invalid_item");
    expect((await patchItem("rec-1", "meal", {}, fakeDeps(draft))).body.error).toBe(
      "invalid_input",
    );
  });

  it("DB 오류 키를 응답 코드로 옮김", async () => {
    const deps = fakeDeps(submitted, {
      currentUser: vi.fn(async () => reviewer),
      update: vi.fn(async () => ({ ok: false as const, error: "note_required" })),
    });
    expect(await patchItem("rec-1", "meal", { resolution: "omitted" }, deps)).toEqual({
      status: 400,
      body: { error: "note_required" },
    });
  });

  it("로그인하지 않으면 401", async () => {
    const deps = fakeDeps(draft, { currentUser: vi.fn(async () => null) });
    expect((await patchItem("rec-1", "meal", { confirmed_by_worker: true }, deps)).status).toBe(
      401,
    );
  });
});

describe("value_ko 한국어 검사 (이슈 #118)", () => {
  it("글자는 있는데 한글이 없을 때만 한국어가 아님", () => {
    expect(isNotKorean("점심 절반 드심")).toBe(false);
    expect(isNotKorean("14:00~17:00 방문")).toBe(false);
    expect(isNotKorean("14:00~17:00")).toBe(false);
    expect(isNotKorean("Bác ăn được một nửa bữa trưa.")).toBe(true);
  });

  it("숫자·시간만 있는 값(방문 시점)은 저장함", async () => {
    const deps = fakeDeps(submitted, { currentUser: vi.fn(async () => reviewer) });
    const r = await patchItem("rec-1", "visit_time", { value_ko: "14:00~17:30" }, deps);
    expect(r.status).toBe(200);
  });

  it("베트남어만 있는 value_ko는 저장하지 않고 400 value_ko_not_korean", async () => {
    const deps = fakeDeps(draft);
    const r = await patchItem("rec-1", "meal", { value_ko: "Bác ăn được một nửa." }, deps);
    expect(r).toEqual({ status: 400, body: { error: "value_ko_not_korean" } });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("관리자가 고칠 때도 같음", async () => {
    const deps = fakeDeps(submitted, { currentUser: vi.fn(async () => reviewer) });
    const r = await patchItem("rec-1", "meal", { value_ko: "Ăn hết." }, deps);
    expect(r.status).toBe(400);
  });

  it("value_ko를 비우는 것([기록 안 함] 등)은 막지 않음", async () => {
    const deps = fakeDeps(draft);
    const r = await patchItem("rec-1", "meal", { value_ko: "" }, deps);
    expect(r.status).toBe(200);
  });
});
