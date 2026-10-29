// 이슈로 올린 버그 중 서버 API로 판정할 수 있는 것.
// 고친 이슈는 다시 깨지지 않는지(회귀), 안 고친 이슈는 고친 뒤 통과하는지 본다.
import { apiAs, call, expect, test } from "../support/fixtures";
import { homeDraft } from "../support/drafts";

test.describe("[#118] 한국어 칸(value_ko)", () => {
  test("작성자·관리자 모두 한글 없는 글(베트남어)을 value_ko에 저장할 수 없다", async ({
    seed,
  }) => {
    const resident = await seed.resident({ careType: "home", visitDays: [1, 2, 3, 4, 5, 6, 7] });
    const id = await seed.record({
      residentId: resident.id,
      draft: homeDraft(),
      visit: { start: "14:00", end: "17:00" },
    });
    const worker = await apiAs("worker");
    const vi = await call(worker, "PATCH", `/api/records/${id}/items/meal`, {
      value_ko: "Bà ăn hết nửa bát cháo",
    });
    expect(vi).toMatchObject({ status: 400, body: { error: "value_ko_not_korean" } });
    // 숫자·시간만 있는 값은 막지 않는다
    const time = await call(worker, "PATCH", `/api/records/${id}/items/visit_time`, {
      value_ko: "14:00~17:00",
    });
    expect(time.status).toBe(200);
    await seed.confirmAll(id);
    expect((await call(worker, "POST", `/api/records/${id}/submit`)).status).toBe(200);
    await worker.dispose();

    const manager = await apiAs("manager");
    const byManager = await call(manager, "PATCH", `/api/records/${id}/items/sleep`, {
      value_ko: "Ngủ ngon",
    });
    expect(byManager).toMatchObject({ status: 400, body: { error: "value_ko_not_korean" } });
    await manager.dispose();
  });
});

test.describe("[#116] 재가 제공시간 합", () => {
  test("작성자가 분을 고쳐 합이 방문 시간을 넘으면 제공 지원이 '확인 필요'가 되고, 정하기 전에는 승인되지 않는다", async ({
    seed,
  }) => {
    const resident = await seed.resident({ careType: "home", visitDays: [1, 2, 3, 4, 5, 6, 7] });
    const id = await seed.record({
      residentId: resident.id,
      draft: homeDraft(),
      visit: { start: "14:00", end: "17:00" },
    });
    const worker = await apiAs("worker");
    const patched = await call(worker, "PATCH", `/api/records/${id}/items/support`, {
      detail: {
        checks: ["몸 씻기 도움", "식사준비, 청소 및 주변정리 정돈, 세탁 등"],
        minutes: { physical: 80, housework: 60, emotional: 60 },
      },
    });
    expect(patched.status).toBe(200);
    await seed.confirmAll(id);
    expect((await call(worker, "POST", `/api/records/${id}/submit`)).status).toBe(200);
    await worker.dispose();

    const support = (await seed.items(id)).find((item) => item.item_key === "support")!;
    expect(support.status, "200분 > 180분이면 '확인 필요'").toBe("needs_check");
    expect(support.reason).not.toBe("");

    // 원래 '확인 필요'(인지)만 정하고 승인 → 제공 지원이 남아 409
    const manager = await apiAs("manager");
    await call(manager, "PATCH", `/api/records/${id}/items/cognition`, {
      resolution: "confirmed_by_reviewer",
    });
    const approve = await call(manager, "POST", `/api/records/${id}/approve`);
    expect(approve.status).toBe(409);
    expect(approve.body.items).toContain("support");
    await manager.dispose();
  });

  test("합이 방문 시간 이하이면 '확인 필요'가 생기지 않는다", async ({ seed }) => {
    const resident = await seed.resident({ careType: "home", visitDays: [1, 2, 3, 4, 5, 6, 7] });
    const id = await seed.record({
      residentId: resident.id,
      draft: homeDraft(),
      visit: { start: "14:00", end: "17:00" },
    });
    const worker = await apiAs("worker");
    await call(worker, "PATCH", `/api/records/${id}/items/support`, {
      detail: { checks: ["몸 씻기 도움"], minutes: { physical: 60, emotional: 60 } },
    });
    await seed.confirmAll(id);
    expect((await call(worker, "POST", `/api/records/${id}/submit`)).status).toBe(200);
    await worker.dispose();
    const support = (await seed.items(id)).find((item) => item.item_key === "support")!;
    expect(support.status).not.toBe("needs_check");
  });
});
