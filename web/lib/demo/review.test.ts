import { describe, expect, it } from "vitest";

import {
  addResident,
  aiLogSummary,
  approveRecord,
  frozenOrder,
  markOverdueNoCare,
  processHistory,
  removeNoCareDay,
  residentEditChanged,
  residentHasRecords,
  resolveItem,
  returnRecord,
  reviewerEditItem,
  reviewOrder,
  reviewQueue,
  sourceSummary,
  updateResident,
  wasResent,
} from "./review";
import { countUnresolved } from "./state";
import {
  addDays,
  addNoCareDay,
  createDemoDb,
  listMissed,
  listOverdue,
  submitRecord,
  type DemoDb,
  workerEditItem,
} from "./store";

const TODAY = "2026-10-27";
const NOW = "2026-10-27T11:00:00+09:00";

function ok(value: DemoDb | { error: string }): DemoDb {
  if ("error" in value) throw new Error(value.error);
  return value;
}

describe("관리자 규칙 (M1~M5)", () => {
  it("검토 대기: 전송한 기록만, 확인 필요가 많은 순", () => {
    const db = createDemoDb(TODAY);
    const queue = reviewQueue(db);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((record) => record.status === "submitted")).toBe(true);
    const counts = queue.map((record) => countUnresolved(record.items));
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("‘확인 필요’를 하나라도 안 정하면 승인을 막고, 모두 정하면 승인한다", () => {
    let db: DemoDb = createDemoDb(TODAY);
    const record = reviewQueue(db)[0];
    expect(approveRecord(db, record.id, NOW)).toEqual({ error: "unresolved" });
    expect(reviewOrder(record)[0].status).toBe("needs_check");
    for (const item of record.items.filter((entry) => entry.status === "needs_check")) {
      db = ok(resolveItem(db, record.id, item.item_key, "confirmed_by_reviewer", "", NOW));
    }
    db = ok(approveRecord(db, record.id, NOW));
    expect(db.records[record.id].status).toBe("approved");
    expect(db.records[record.id].approvedBy).toBe(db.reviewer.name);
  });

  it("[기록 안 함]은 사유가 있어야 하고 내용을 비운다. 다시 정하면 승인이 또 막힌다", () => {
    let db: DemoDb = createDemoDb(TODAY);
    const record = reviewQueue(db)[0];
    const item = record.items.find((entry) => entry.status === "needs_check")!;
    expect(resolveItem(db, record.id, item.item_key, "omitted", " ", NOW)).toEqual({
      error: "note_required",
    });
    db = ok(resolveItem(db, record.id, item.item_key, "omitted", "원문으로 판단 불가", NOW));
    const omitted = db.records[record.id].items.find((entry) => entry.item_key === item.item_key)!;
    expect(omitted.value_ko).toBe("");
    expect(omitted.before_ko).toBe(item.value_ko);
    expect(omitted.resolution_note).toBe("원문으로 판단 불가");
    db = ok(resolveItem(db, record.id, item.item_key, null, "", NOW));
    expect(countUnresolved(db.records[record.id].items)).toBe(countUnresolved(record.items));
  });

  // 이슈 #140: [확인함]/[기록 안 함]을 골라도 연 때의 카드 순서를 지킨다
  it("처리해도 화면을 연 때의 카드 순서가 그대로다", () => {
    let db: DemoDb = createDemoDb(TODAY);
    const record = reviewQueue(db).find((entry) => countUnresolved(entry.items) >= 2)!;
    const keys = reviewOrder(record).map((item) => item.item_key);
    const [first, second] = record.items
      .filter((item) => item.status === "needs_check")
      .map((item) => item.item_key);
    db = ok(resolveItem(db, record.id, first, "confirmed_by_reviewer", "", NOW));
    db = ok(resolveItem(db, record.id, second, "omitted", "원문에 없음", NOW));
    const after = db.records[record.id];
    // 새로 계산하면 처리한 항목이 뒤로 가지만, 연 때 순서로 늘어놓으면 그대로다
    expect(reviewOrder(after).map((item) => item.item_key)).not.toEqual(keys);
    expect(frozenOrder(after, keys).map((item) => item.item_key)).toEqual(keys);
    expect(frozenOrder(after, keys).find((item) => item.item_key === first)).toMatchObject({
      resolution: "confirmed_by_reviewer",
      resolved_by: db.reviewer.name,
      resolved_at: NOW,
    });
    // 모르는 항목은 뒤에 붙는다
    expect(frozenOrder(after, keys.slice(1)).map((item) => item.item_key)).toEqual([
      ...keys.slice(1),
      keys[0],
    ]);
  });

  it("관리자가 고치면 source=reviewer, 고치기 전 내용을 남긴다", () => {
    const db = createDemoDb(TODAY);
    const record = reviewQueue(db)[0];
    const next = reviewerEditItem(db, record.id, "meal", "점심 절반 드심.", NOW);
    const meal = next.records[record.id].items.find((item) => item.item_key === "meal")!;
    expect(meal.source).toBe("reviewer");
    expect(meal.value_ko).toBe("점심 절반 드심.");
    expect(meal.before_ko).toBe(record.items.find((item) => item.item_key === "meal")!.value_ko);
  });

  it("되돌리기는 사유가 있어야 하고, 되돌린 기록은 검토 대기에서 빠진다", () => {
    const db = createDemoDb(TODAY);
    const record = reviewQueue(db)[0];
    expect(returnRecord(db, record.id, "  ", NOW)).toEqual({ error: "reason_required" });
    const next = ok(returnRecord(db, record.id, "식사량을 다시 확인해 주세요.", NOW));
    expect(next.records[record.id].status).toBe("returned");
    expect(reviewQueue(next).some((entry) => entry.id === record.id)).toBe(false);
  });

  it("되돌린 뒤 다시 전송한 기록만 '재전송'으로 표시한다", () => {
    const db = createDemoDb(TODAY);
    const record = reviewQueue(db)[0];
    expect(wasResent(record)).toBe(false);
    const returned = ok(returnRecord(db, record.id, "식사량을 다시 확인해 주세요.", NOW));
    expect(wasResent(returned.records[record.id])).toBe(false);
    const resent = submitRecord(returned, record.id, "2026-10-27T12:00:00+09:00");
    expect(resent.records[record.id].status).toBe("submitted");
    expect(wasResent(resent.records[record.id])).toBe(true);
  });

  // 이슈 #124: 되돌림 → 작성자 고침 → 재전송 → 관리자 수정·[확인함]·[기록 안 함] → 승인
  it("요약 띠는 이력(edited)으로 센다: 관리자가 같은 항목을 고쳐도 작성자 수정이 남고, [기록 안 함]은 수정이 아니다", () => {
    let db: DemoDb = createDemoDb(TODAY);
    const record = reviewQueue(db).find((entry) => countUnresolved(entry.items) >= 2)!;
    const [first, second] = record.items
      .filter((item) => item.status === "needs_check")
      .map((item) => item.item_key);
    const seeded = sourceSummary(record);
    db = ok(returnRecord(db, record.id, `[${first}] 다시 확인해 주세요`, NOW));
    db = workerEditItem(db, record.id, first, { value_ko: "작성자가 고친 내용" }, NOW);
    db = submitRecord(db, record.id, "2026-10-27T12:00:00+09:00");
    db = reviewerEditItem(
      db,
      record.id,
      first,
      "관리자가 다듬은 내용",
      "2026-10-27T13:00:00+09:00",
    );
    db = ok(
      resolveItem(db, record.id, first, "confirmed_by_reviewer", "", "2026-10-27T13:01:00+09:00"),
    );
    db = ok(
      resolveItem(db, record.id, second, "omitted", "원문에 없음", "2026-10-27T13:02:00+09:00"),
    );
    const summary = sourceSummary(db.records[record.id]);
    expect(new Set(summary.worker)).toEqual(new Set([...seeded.worker, first]));
    expect(summary.reviewer).toEqual([first]);
    expect(summary.reviewer).not.toContain(second);
    expect(summary.aiCount).toBe(9 - new Set([...summary.worker, ...summary.reviewer]).size);

    db = ok(approveRecord(db, record.id, "2026-10-27T14:00:00+09:00"));
    const steps = processHistory(db.records[record.id]);
    expect(steps.map((step) => step.kind)).toEqual([
      "created",
      "submitted",
      "returned",
      "resubmitted",
      "reviewed",
      "approved",
    ]);
    expect(steps[2]).toMatchObject({
      actor: db.reviewer.name,
      reason: `[${first}] 다시 확인해 주세요`,
    });
    expect(steps[3].edited).toEqual([first]);
    expect(steps[4]).toMatchObject({
      edited: [first],
      resolved: expect.arrayContaining([
        { item_key: first, resolution: "confirmed_by_reviewer" },
        { item_key: second, resolution: "omitted" },
      ]),
    });
  });

  it("승인만 한 기록도 ‘검토·수정(수정 없음)’ 단계를 두고, 되돌리기 전 관리자 수정은 되돌림 앞에 놓인다", () => {
    const db = createDemoDb(TODAY);
    const approved = Object.values(db.records).find((record) => record.status === "approved")!;
    expect(processHistory(approved).map((step) => step.kind)).toEqual([
      "created",
      "submitted",
      "reviewed",
      "approved",
    ]);
    const returned = Object.values(db.records).find((record) => record.status === "returned")!;
    const steps = processHistory(returned);
    expect(steps.map((step) => step.kind)).toEqual([
      "created",
      "submitted",
      "reviewed",
      "returned",
    ]);
    expect(steps[2].edited).toEqual(["meal"]);
    expect(steps[3].reason).toBe(returned.returnReason);
    expect(sourceSummary(returned)).toMatchObject({ worker: ["meal"], reviewer: ["meal"] });
  });

  it("기한 지난 빈 기록: 8~30일 전 빈 날만, 관리자가 기록 없음으로 정리하면 빠진다", () => {
    const db = createDemoDb(TODAY);
    const overdue = listOverdue(db, TODAY);
    expect(overdue.map((row) => row.careDate)).toEqual([
      addDays(TODAY, -8),
      addDays(TODAY, -9),
      addDays(TODAY, -10),
    ]);
    expect(overdue.every((row) => row.residentId === "park")).toBe(true);
    const day = overdue[0];
    expect(addNoCareDay(db, { ...day, reason: "hospital", note: "" }, TODAY)).toEqual({
      error: "too_old",
    });
    expect(markOverdueNoCare(db, { ...day, reason: "other", note: " " }, TODAY)).toEqual({
      error: "note_required",
    });
    expect(
      markOverdueNoCare(
        db,
        { residentId: "park", careDate: addDays(TODAY, -31), reason: "hospital", note: "" },
        TODAY,
      ),
    ).toEqual({ error: "out_of_range" });
    const next = ok(markOverdueNoCare(db, { ...day, reason: "hospital", note: "" }, TODAY));
    expect(next.noCareDays.at(-1)?.createdBy).toBe(next.reviewer.name);
    expect(listOverdue(next, TODAY)).toHaveLength(2);
    const cleared = removeNoCareDay(next, day.residentId, day.careDate);
    expect(listOverdue(cleared, TODAY)).toHaveLength(3);
  });

  it("기록 없음 처리를 지우면 못 쓴 기록에 다시 나온다", () => {
    const db = createDemoDb(TODAY);
    const day = listMissed(db, TODAY).find((row) => row.kind === "missing")!;
    const marked = ok(
      addNoCareDay(
        db,
        { residentId: day.residentId, careDate: day.careDate, reason: "hospital", note: "" },
        TODAY,
      ),
    );
    const cleared = removeNoCareDay(marked, day.residentId, day.careDate);
    expect(
      listMissed(cleared, TODAY).some(
        (row) => row.residentId === day.residentId && row.careDate === day.careDate,
      ),
    ).toBe(true);
  });

  it("어르신 추가는 실명, 재가는 방문 요일을 정해야 못 쓴 기록을 센다", () => {
    const db = createDemoDb(TODAY);
    expect(addResident(db, { name: " ", careType: "home", startDate: TODAY })).toEqual({
      error: "name_required",
    });
    const same = ok(addResident(db, { name: "김가상", careType: "home", startDate: TODAY }));
    expect(same.residents.filter((resident) => resident.name === "김가상")).toHaveLength(2);
    expect(same.residents.at(-1)!.id).not.toBe(db.residents[0].id);
    let next = ok(addResident(db, { name: "정가상", careType: "home", startDate: "2026-10-20" }));
    const added = next.residents.at(-1)!;
    expect(added.name).toBe("정가상");
    expect(listMissed(next, TODAY).some((row) => row.residentId === added.id)).toBe(false);
    next = ok(
      updateResident(next, added.id, {
        visitDays: [1, 3],
        visitTime: "10:00~13:00",
        startDate: "2026-10-20",
      }),
    );
    expect(listMissed(next, TODAY).filter((row) => row.residentId === added.id).length).toBe(2);
  });

  // 이슈 #96: [수정]으로 실명·급여 종류를 고치고, 바뀐 게 없으면 '저장했어요'를 띄우지 않는다
  it("어르신 수정: 동명이인을 허용하고, 기록 있는 어르신은 급여 종류를 못 바꾸며, 바뀐 칸을 가려낸다", () => {
    const db = createDemoDb(TODAY);
    const [first, second] = db.residents;
    const base = {
      visitDays: first.visitDays,
      visitTime: first.visitTime,
      startDate: first.startDate,
    };
    expect(ok(updateResident(db, first.id, { ...base, name: second.name })).residents[0].name).toBe(
      second.name,
    );
    expect(updateResident(db, first.id, { ...base, name: " " })).toEqual({
      error: "name_required",
    });
    expect(residentHasRecords(db, first.id)).toBe(true);
    expect(
      updateResident(db, first.id, {
        ...base,
        careType: first.careType === "home" ? "facility" : "home",
      }),
    ).toEqual({ error: "care_type_locked" });
    const renamed = ok(updateResident(db, first.id, { ...base, name: "최가상" }));
    expect(renamed.residents[0]).toMatchObject({ name: "최가상", initial: "최" });
    expect(residentEditChanged(first, null, base)).toBe(false);
    expect(residentEditChanged(first, null, { ...base, name: first.name })).toBe(false);
    expect(residentEditChanged(first, null, { ...base, name: "최가상" })).toBe(true);
    expect(residentEditChanged(first, ["w1"], { ...base, workerIds: ["w1"] })).toBe(false);
    expect(residentEditChanged(first, ["w1"], { ...base, workerIds: ["w1", "w2"] })).toBe(true);
    expect(residentEditChanged(first, null, { ...base, startDate: "2026-01-01" })).toBe(true);
  });
});

describe("aiLogSummary — M2 AI 작업 기록 제목(이슈 #179)", () => {
  it("도구를 쓴 기록이 없으면 빈 괄호 대신 '없음'", () => {
    expect(aiLogSummary([], true)).toBe("AI 작업 기록 없음");
    expect(aiLogSummary([], true)).not.toContain("()");
  });
  it("도구 이름을 순서대로 이어 보인다", () => {
    expect(aiLogSummary([{ name: "원문 읽기" }, { name: "초안 저장" }], true)).toBe(
      "AI 작업 기록 · 도구 2번 사용 (원문 읽기 → 초안 저장)",
    );
  });
  it("읽는 중에는 개수·'없음'을 말하지 않는다", () => {
    expect(aiLogSummary([], false)).toBe("AI 작업 기록 · 불러오는 중");
  });
});
