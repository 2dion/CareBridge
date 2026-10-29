// 테스트 계획(시연-일정 v1.1) '작성 전(못 쓴 기록)'·'운영 재시도'·'지연전송' 줄.
// DB 함수와 트리거가 정한 대로 막고 계산하는지 작성자·관리자 권한으로 확인한다.
import { dbAs, expect, kstDate, kstIsoDow, test } from "../support/fixtures";
import { facilityDraft } from "../support/drafts";

type Missed = { resident_id: string; care_date: string; kind: string; record_id: string | null };

async function missedFor(residentId: string, role: "worker" | "trainee" = "worker") {
  const db = await dbAs(role);
  const { data, error } = await db.rpc("list_missed_records");
  expect(error).toBeNull();
  return (data as Missed[]).filter((row) => row.resident_id === residentId);
}

test.describe("작성 전(못 쓴 기록)", () => {
  test("[계획 작성전-1] 재가 어르신의 방문 요일이 아닌 날은 '작성 전'에 나오지 않는다", async ({
    seed,
  }) => {
    // 이틀 전 요일만 방문 요일 → 어제는 방문 요일이 아님
    const twoDaysAgo = kstIsoDow(2);
    const resident = await seed.resident({ careType: "home", visitDays: [twoDaysAgo] });
    const dates = (await missedFor(resident.id)).map((row) => row.care_date);
    expect(dates).toContain(kstDate(2));
    expect(dates).not.toContain(kstDate(1));
  });

  test("[계획 작성전-2] 담당 시작일 전 날짜는 '작성 전'에 나오지 않는다", async ({ seed }) => {
    const resident = await seed.resident({ startDaysAgo: 2 });
    const dates = (await missedFor(resident.id)).map((row) => row.care_date).sort();
    expect(dates).toEqual([kstDate(2), kstDate(1)].sort());
  });

  test("[계획 작성전-3] [이 날 기록 없음]으로 사유를 남기면 '작성 전'에서 빠지고 관리자가 사유를 읽는다", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const worker = await dbAs("worker");
    const { error } = await worker.from("no_care_days").insert({
      resident_id: resident.id,
      care_date: kstDate(1),
      reason: "other",
      note: "시험 사유: 가족 외출",
    });
    expect(error).toBeNull();
    expect((await missedFor(resident.id)).map((row) => row.care_date)).not.toContain(kstDate(1));

    const manager = await dbAs("manager");
    const { data } = await manager
      .from("no_care_days")
      .select("reason, note")
      .eq("resident_id", resident.id);
    expect(data).toEqual([{ reason: "other", note: "시험 사유: 가족 외출" }]);
  });

  test("[계획 작성전-4] 8일 전·내일 날짜로는 기록을 만들 수 없다(오늘~7일 전만)", async ({
    seed,
  }) => {
    const resident = await seed.resident({ startDaysAgo: 10 });
    const worker = await dbAs("worker");
    for (const careDate of [kstDate(8), kstDate(-1)]) {
      const { error } = await worker
        .from("records")
        .insert({ resident_id: resident.id, care_date: careDate });
      expect(error?.message, careDate).toBe("care_date_out_of_range");
    }
    const ok = await worker
      .from("records")
      .insert({ resident_id: resident.id, care_date: kstDate(7) })
      .select("id")
      .single();
    expect(ok.error).toBeNull();
  });

  test("[계획 작성전-5·운영 재시도] 같은 작성자·같은 날·같은 어르신의 두 번째 기록은 생기지 않는다", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const worker = await dbAs("worker");
    const first = await worker.from("records").insert({ resident_id: resident.id }).select("id");
    expect(first.error).toBeNull();
    const second = await worker.from("records").insert({ resident_id: resident.id }).select("id");
    expect(second.error?.code).toBe("23505");
    const { data } = await seed.admin.from("records").select("id").eq("resident_id", resident.id);
    expect(data).toHaveLength(1);
  });

  test("[계획 작성전-6] 다른 기관의 '작성 전'·'기록 없음'은 보이지 않는다", async ({ seed }) => {
    const resident = await seed.resident();
    const worker = await dbAs("worker");
    await worker.from("no_care_days").insert({
      resident_id: resident.id,
      care_date: kstDate(2),
      reason: "hospital",
      note: "",
    });
    const trainer = await dbAs("trainer");
    expect(await missedFor(resident.id, "trainee")).toEqual([]);
    const { data: noCare } = await trainer
      .from("no_care_days")
      .select("care_date")
      .eq("resident_id", resident.id);
    expect(noCare).toEqual([]);
    const { data: overdue } = await trainer.rpc("list_overdue_records");
    expect(
      (overdue as { resident_id: string }[]).filter((row) => row.resident_id === resident.id),
    ).toEqual([]);
  });

  test("[계획 작성전-7] 날짜를 주지 않고 만든 기록의 돌봄 날짜는 한국 날짜 오늘이다", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const worker = await dbAs("worker");
    const { data } = await worker
      .from("records")
      .insert({ resident_id: resident.id })
      .select("care_date")
      .single();
    expect(data?.care_date).toBe(kstDate());
  });

  test("[계획 작성전-8] '기록 없음' 처리한 날로는 기록을 만들 수 없고, 관리자가 처리를 지우면 쓸 수 있다", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const worker = await dbAs("worker");
    await worker.from("no_care_days").insert({
      resident_id: resident.id,
      care_date: kstDate(1),
      reason: "hospital",
      note: "",
    });
    const blocked = await worker
      .from("records")
      .insert({ resident_id: resident.id, care_date: kstDate(1) });
    expect(blocked.error?.message).toBe("no_care_day_exists");

    const manager = await dbAs("manager");
    const removed = await manager
      .from("no_care_days")
      .delete()
      .eq("resident_id", resident.id)
      .eq("care_date", kstDate(1))
      .select("care_date");
    expect(removed.data).toHaveLength(1);
    const ok = await worker
      .from("records")
      .insert({ resident_id: resident.id, care_date: kstDate(1) });
    expect(ok.error).toBeNull();
  });

  test("[계획 작성전-9] 기록(임시 저장 포함)이 있는 날에는 '기록 없음'을 남길 수 없다", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    await seed.record({ residentId: resident.id, careDate: kstDate(1) });
    const worker = await dbAs("worker");
    const { error } = await worker.from("no_care_days").insert({
      resident_id: resident.id,
      care_date: kstDate(1),
      reason: "hospital",
      note: "",
    });
    expect(error?.message).toBe("record_exists");
  });

  test("[계획 작성전-10] 만든 기록의 돌봄 날짜는 바꿀 수 없다", async ({ seed }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, careDate: kstDate(1) });
    const worker = await dbAs("worker");
    const { error } = await worker
      .from("records")
      .update({ care_date: kstDate(2) })
      .eq("id", id);
    expect(error?.message).toBe("invalid_transition");
    expect((await seed.recordRow(id)).care_date).toBe(kstDate(1));
  });

  test("[계획 작성전-11] 방문 요일이 비어 있는 재가 어르신은 '작성 전'에 나오지 않는다", async ({
    seed,
  }) => {
    const resident = await seed.resident({ careType: "home", visitDays: null });
    expect(await missedFor(resident.id)).toEqual([]);
  });

  test("[계획 작성전-12] 오늘 기록이 없어도 오늘은 '작성 전'에 나오지 않는다(어제~7일 전만)", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const dates = (await missedFor(resident.id)).map((row) => row.care_date);
    expect(dates).not.toContain(kstDate());
    expect(dates).toHaveLength(7);
  });

  test("[계획 임시저장] 어제 날짜의 임시 저장은 '작성 전' 목록에 임시 저장(draft)으로 나온다", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, careDate: kstDate(1) });
    const rows = await missedFor(resident.id);
    expect(rows).toContainEqual(
      expect.objectContaining({ care_date: kstDate(1), kind: "draft", record_id: id }),
    );
  });
});

test.describe("지연전송", () => {
  test("[계획 지연전송-1] 돌봄 날짜보다 늦게 처음 전송하면 며칠 뒤인지 계산된다(7일 전 기록)", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({
      residentId: resident.id,
      careDate: kstDate(7),
      draft: facilityDraft(),
      submit: true,
    });
    const manager = await dbAs("manager");
    const { data } = await manager.rpc("record_late_submit", { p_record_id: id });
    expect((data as { late_days: number }[])[0].late_days).toBe(7);
  });

  test("[계획 지연전송-2] 제날 전송한 기록은 지연전송이 아니다(되돌린 뒤 다시 전송해도 첫 전송만 본다)", async ({
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    const manager = await dbAs("manager");
    const { data } = await manager.rpc("record_late_submit", { p_record_id: id });
    expect((data as { late_days: number }[])[0].late_days).toBe(0);
  });
});
