// 테스트 계획(시연-일정 v1.1) '승인 흐름' 4줄. 서버 API와 DB가 막는지 화면 없이 확인한다.
import { apiAs, call, dbAs, expect, test } from "../support/fixtures";
import { facilityDraft } from "../support/drafts";

test.describe("승인 흐름", () => {
  test("[계획 승인-1] '확인 필요'가 남은 기록은 승인 요청을 서버가 거절한다(API·DB 둘 다)", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });

    const manager = await apiAs("manager");
    const result = await call(manager, "POST", `/api/records/${id}/approve`);
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("unresolved_needs_check");
    expect(result.body.items).toEqual(expect.arrayContaining(["meal", "discomfort"]));

    // API를 거치지 않고 DB에 바로 승인을 써도 트리거가 막는다
    const db = await dbAs("manager");
    const direct = await db.from("records").update({ status: "approved" }).eq("id", id);
    expect(direct.error?.message).toBe("unresolved_needs_check");
    expect((await seed.recordRow(id)).status).toBe("submitted");
    await manager.dispose();
  });

  test("[계획 승인-2] 되돌린 기록을 고쳐 다시 전송하면 검토 대기(submitted)로 돌아오고 이력이 남는다", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });

    const manager = await apiAs("manager");
    const returned = await call(manager, "POST", `/api/records/${id}/return`, {
      reason: "[식사] 섭취량을 다시 확인해 주세요.",
    });
    expect(returned.status).toBe(200);
    expect((await seed.recordRow(id)).status).toBe("returned");

    await seed.confirmAll(id);
    const worker = await apiAs("worker");
    const again = await call(worker, "POST", `/api/records/${id}/submit`);
    expect(again.status).toBe(200);
    expect((await seed.recordRow(id)).status).toBe("submitted");

    const { data: events } = await seed.admin
      .from("record_events")
      .select("type, created_at")
      .eq("record_id", id)
      .in("type", ["submitted", "returned"])
      .order("created_at");
    expect(events?.map((event) => event.type)).toEqual(["submitted", "returned", "submitted"]);
    await manager.dispose();
    await worker.dispose();
  });

  test("[계획 승인-3] 같은 기록을 두 번 승인해도 한 번만 승인된다(동시에 눌러도)", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    await seed.resolveAll(id);

    const manager = await apiAs("manager");
    const results = await Promise.all([
      call(manager, "POST", `/api/records/${id}/approve`),
      call(manager, "POST", `/api/records/${id}/approve`),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const third = await call(manager, "POST", `/api/records/${id}/approve`);
    expect(third.status).toBe(409);

    const { data: approvedEvents } = await seed.admin
      .from("record_events")
      .select("type")
      .eq("record_id", id)
      .eq("type", "approved");
    expect(approvedEvents).toHaveLength(1);
    await manager.dispose();
  });

  test("[계획 승인-4] 승인한 기록은 관리자·작성자 누구도 고칠 수 없다", async ({ seed }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    await seed.resolveAll(id);
    const manager = await apiAs("manager");
    expect((await call(manager, "POST", `/api/records/${id}/approve`)).status).toBe(200);
    const before = (await seed.items(id)).find((item) => item.item_key === "sleep")!.value_ko;

    const patched = await call(manager, "PATCH", `/api/records/${id}/items/sleep`, {
      value_ko: "승인 뒤에 고친 문장",
    });
    expect(patched.status).toBeGreaterThanOrEqual(400);

    for (const role of ["manager", "worker"] as const) {
      const db = await dbAs(role);
      await db.from("record_items").update({ value_ko: "몰래 고침" }).eq("record_id", id);
      await db.from("records").update({ status: "draft" }).eq("id", id);
    }
    expect((await seed.items(id)).find((item) => item.item_key === "sleep")!.value_ko).toBe(before);
    expect((await seed.recordRow(id)).status).toBe("approved");
    await manager.dispose();
  });
});
