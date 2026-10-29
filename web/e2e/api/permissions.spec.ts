// 테스트 계획 '권한' 2줄과 역할별 서버 거절(#114 서버 쪽). 원칙 7: 다른 기관 기록은 읽을 수 없다.
import { apiAs, call, dbAs, expect, test } from "../support/fixtures";
import { facilityDraft } from "../support/drafts";

test.describe("권한", () => {
  test("[계획 권한-1] 다른 기관(교육용 기관)의 관리자·작성자는 이 기관 기록을 읽지도 고치지도 못한다", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });

    for (const role of ["trainer", "trainee"] as const) {
      const db = await dbAs(role);
      const { data: records } = await db.from("records").select("id").eq("id", id);
      expect(records, `${role} 기록 읽기`).toEqual([]);
      const { data: items } = await db.from("record_items").select("item_key").eq("record_id", id);
      expect(items, `${role} 항목 읽기`).toEqual([]);
      const { data: residents } = await db.from("residents").select("id").eq("id", resident.id);
      expect(residents, `${role} 어르신 읽기`).toEqual([]);
    }

    const trainer = await apiAs("trainer");
    expect((await call(trainer, "POST", `/api/records/${id}/approve`)).status).toBe(404);
    expect(
      (
        await call(trainer, "PATCH", `/api/records/${id}/items/meal`, {
          resolution: "confirmed_by_reviewer",
        })
      ).status,
    ).toBe(404);
    expect((await call(trainer, "GET", `/api/records/${id}/print`)).status).toBe(404);
    await trainer.dispose();
    expect((await seed.recordRow(id)).status).toBe("submitted");
  });

  test("[계획 권한-2] 같은 기관의 다른 작성자는 남의 기록을 읽지도 고치지도 못한다", async ({
    seed,
  }) => {
    const resident = await seed.resident({ workers: ["worker", "worker2"] });
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft() });

    const other = await dbAs("worker2");
    const { data } = await other.from("records").select("id").eq("id", id);
    expect(data).toEqual([]);
    await other.from("records").update({ transcript: "남이 고침" }).eq("id", id);
    expect((await seed.recordRow(id)).transcript).not.toBe("남이 고침");

    const api = await apiAs("worker2");
    expect(
      (await call(api, "PATCH", `/api/records/${id}/items/sleep`, { confirmed_by_worker: true }))
        .status,
    ).toBe(404);
    expect((await call(api, "POST", `/api/records/${id}/submit`)).status).toBe(404);
    await api.dispose();
  });

  test("[#114] 역할에 맞지 않는 요청은 서버가 이유와 함께 거절한다", async ({ seed }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });

    const worker = await apiAs("worker");
    const approve = await call(worker, "POST", `/api/records/${id}/approve`);
    expect(approve).toMatchObject({ status: 403, body: { error: "reviewer_only" } });
    const ret = await call(worker, "POST", `/api/records/${id}/return`, { reason: "시험" });
    expect(ret).toMatchObject({ status: 403, body: { error: "reviewer_only" } });
    await worker.dispose();

    const manager = await apiAs("manager");
    const submit = await call(manager, "POST", `/api/records/${id}/submit`);
    expect(submit.status).toBe(403);
    const confirm = await call(manager, "PATCH", `/api/records/${id}/items/sleep`, {
      confirmed_by_worker: true,
    });
    expect(confirm).toMatchObject({ status: 403, body: { error: "not_record_worker" } });
    const noReason = await call(manager, "POST", `/api/records/${id}/return`, { reason: " " });
    expect(noReason).toMatchObject({ status: 400, body: { error: "return_reason_required" } });
    await manager.dispose();
  });
});
