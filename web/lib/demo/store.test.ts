import { describe, expect, it } from "vitest";

import {
  timeRangeLabel,
  addDays,
  addNoCareDay,
  canApproveRecord,
  canSubmitRecord,
  confirmItem,
  createDemoDb,
  ensureRecord,
  fillMockDraft,
  findRecord,
  groupItems,
  isoWeekday,
  lateDays,
  listMissed,
  markProcessing,
  markDraftFailed,
  missedOldestFirst,
  retryDraft,
  returnedRecords,
  submitRecord,
  todayCards,
  workerEditItem,
} from "./store";

const TODAY = "2026-10-27"; // 화요일
const NOW = "2026-10-27T10:00:00+09:00";

describe("Mock 데이터 규칙 (데이터구조 v1.6.2)", () => {
  it.each(["voice", "text"] as const)(
    "실패한 %s 초안은 입력과 항목을 보존하고 W3에서 재처리한다",
    (mode) => {
      const db = createDemoDb(TODAY);
      const made = ensureRecord(db, "kim", TODAY, TODAY, NOW);
      if ("error" in made) throw new Error(made.error);
      const processing = markProcessing(
        made.db,
        made.id,
        mode === "text" ? "점심 죽 절반 드심." : null,
        NOW,
      );
      const failed = markDraftFailed(processing, made.id, NOW);
      const before = failed.records[made.id];
      const retried = retryDraft(failed, made.id, NOW).records[made.id];
      expect(retried.draftState).toBe("processing");
      expect(retried.inputMode).toBe(mode);
      expect(retried.transcript).toBe(before.transcript);
      expect(retried.items).toEqual(before.items);
      const submitted = { ...before, status: "submitted" as const };
      const locked = { ...failed, records: { ...failed.records, [made.id]: submitted } };
      expect(retryDraft(locked, made.id, NOW).records[made.id]).toEqual(submitted);
    },
  );
  it("한국 날짜 계산: 요일 1=월 … 7=일", () => {
    expect(isoWeekday("2026-10-26")).toBe(1);
    expect(isoWeekday("2026-11-01")).toBe(7);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("오늘 카드: 시설은 매일, 재가는 방문 요일에만", () => {
    const db = createDemoDb(TODAY);
    expect(todayCards(db, TODAY).map((card) => card.resident.id)).toContain("lee");
    const sunday = "2026-11-01";
    const sundayDb = createDemoDb(sunday);
    expect(todayCards(sundayDb, sunday).map((card) => card.resident.id)).not.toContain("lee");
  });

  it("W4 '작성 전' 탭: 오래된 날짜가 위, 같은 날은 순서 그대로 (이슈 #150)", () => {
    const db = createDemoDb(TODAY);
    const missed = listMissed(db, TODAY);
    const sorted = missedOldestFirst(missed);
    expect(sorted).toHaveLength(missed.length);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i - 1].careDate <= sorted[i].careDate).toBe(true);
    }
    // 같은 날은 들어온 순서 그대로(안정 정렬)
    const sameDay = [
      { residentId: "b", careDate: "2026-10-20", kind: "missing" as const },
      { residentId: "a", careDate: "2026-10-20", kind: "missing" as const },
      { residentId: "c", careDate: "2026-10-19", kind: "draft" as const },
    ];
    expect(missedOldestFirst(sameDay).map((row) => row.residentId)).toEqual(["c", "b", "a"]);
    // 원본(listMissed, 최신이 위)은 그대로라 W1 건수·M1·기간 거르기 순서는 바뀌지 않는다
    expect(sameDay.map((row) => row.residentId)).toEqual(["b", "a", "c"]);
    expect(missed[0].careDate >= missed[missed.length - 1].careDate).toBe(true);
  });

  it("못 쓴 기록: 지난 7일 빈 날과 지난 임시 저장을 모두 보여 준다", () => {
    const db = createDemoDb(TODAY);
    const missed = listMissed(db, TODAY);
    expect(missed.some((row) => row.kind === "draft" && row.residentId === "kim")).toBe(true);
    expect(missed.some((row) => row.kind === "missing" && row.residentId === "park")).toBe(true);
    expect(missed.every((row) => row.careDate < TODAY)).toBe(true);
  });

  it("기록 없음 처리한 날은 못 쓴 기록에서 빠지고 새 기록을 막는다", () => {
    const db = createDemoDb(TODAY);
    const day = listMissed(db, TODAY).find((row) => row.kind === "missing")!;
    const next = addNoCareDay(
      db,
      { residentId: day.residentId, careDate: day.careDate, reason: "hospital", note: "" },
      TODAY,
    );
    if ("error" in next) throw new Error(next.error);
    expect(
      listMissed(next, TODAY).some(
        (row) => row.residentId === day.residentId && row.careDate === day.careDate,
      ),
    ).toBe(false);
    expect(ensureRecord(next, day.residentId, day.careDate, TODAY, NOW)).toEqual({
      error: "no_care_day",
    });
  });

  it("기타 사유는 글이 있어야 하고, 기록이 있는 날은 처리할 수 없다", () => {
    const db = createDemoDb(TODAY);
    const day = listMissed(db, TODAY).find((row) => row.kind === "missing")!;
    expect(
      addNoCareDay(
        db,
        { residentId: day.residentId, careDate: day.careDate, reason: "other", note: " " },
        TODAY,
      ),
    ).toEqual({ error: "note_required" });
    expect(
      addNoCareDay(
        db,
        { residentId: "kim", careDate: addDays(TODAY, -1), reason: "hospital", note: "" },
        TODAY,
      ),
    ).toEqual({ error: "has_record" });
  });

  it("기록 만들기는 오늘부터 7일 전까지만", () => {
    const db = createDemoDb(TODAY);
    expect(ensureRecord(db, "kim", addDays(TODAY, 1), TODAY, NOW)).toEqual({ error: "future" });
    expect(ensureRecord(db, "kim", addDays(TODAY, -8), TODAY, NOW)).toEqual({ error: "too_old" });
    const made = ensureRecord(db, "kim", addDays(TODAY, -4), TODAY, NOW);
    expect("id" in made).toBe(true);
  });

  it("모든 항목을 맞아요·고침 해야 보낼 수 있고, ‘확인 필요’는 남아도 된다", () => {
    let db = createDemoDb(TODAY);
    const made = ensureRecord(db, "kim", TODAY, TODAY, NOW);
    if ("error" in made) throw new Error(made.error);
    db = fillMockDraft(markProcessing(made.db, made.id, null, NOW), made.id, NOW);
    expect(canSubmitRecord(db.records[made.id])).toBe(false);
    for (const item of db.records[made.id].items) {
      if (item.status !== "needs_check") db = confirmItem(db, made.id, item.item_key, NOW);
    }
    expect(canSubmitRecord(db.records[made.id])).toBe(true);
    db = submitRecord(db, made.id, NOW);
    expect(db.records[made.id].status).toBe("submitted");
    expect(lateDays(db.records[made.id])).toBe(0);
    // 관리자가 ‘확인 필요’를 정하지 않으면 승인할 수 없다.
    expect(canApproveRecord(db.records[made.id])).toBe(false);
  });

  it("AI 초안을 다시 만들어도 작성자가 고친 항목은 덮어쓰지 않는다", () => {
    let db = createDemoDb(TODAY);
    const made = ensureRecord(db, "kim", TODAY, TODAY, NOW);
    if ("error" in made) throw new Error(made.error);
    db = fillMockDraft(made.db, made.id, NOW);
    db = workerEditItem(db, made.id, "meal", { value_ko: "점심 다 드심." }, NOW);
    db = fillMockDraft(db, made.id, NOW);
    const meal = db.records[made.id].items.find((item) => item.item_key === "meal")!;
    expect(meal.value_ko).toBe("점심 다 드심.");
    expect(meal.source).toBe("worker");
  });

  it("수정 필요 기록에서 작성자가 고치면 그 항목의 resolution을 비운다", () => {
    let db = createDemoDb(TODAY);
    const returned = returnedRecords(db)[0];
    const resolved = returned.items.find((item) => item.resolution !== null)!;
    db = workerEditItem(db, returned.id, resolved.item_key, { value_ko: "다시 쓴 내용" }, NOW);
    const after = db.records[returned.id].items.find(
      (item) => item.item_key === resolved.item_key,
    )!;
    expect(after.resolution).toBeNull();
    expect(groupItems(db.records[returned.id].items).done.map((item) => item.item_key)).toContain(
      resolved.item_key,
    );
  });

  it("재가: 지원별 분 합이 방문 시간보다 길면 코드가 ‘확인 필요’로 바꾼다", () => {
    let db = createDemoDb(TODAY);
    const made = ensureRecord(db, "lee", TODAY, TODAY, NOW);
    if ("error" in made) throw new Error(made.error);
    db = fillMockDraft(made.db, made.id, NOW);
    db = workerEditItem(
      db,
      made.id,
      "support",
      {
        value_ko: "목욕, 청소, 말벗",
        detail: { minutes: { physical: 80, housework: 60, emotional: 60 } },
      },
      NOW,
    );
    let support = db.records[made.id].items.find((item) => item.item_key === "support")!;
    expect(support.status).toBe("needs_check");
    expect(support.reason).toContain("200분");
    // 코드가 쓴 이유도 모국어 문장이 함께 있다(확인필요이유병기 결정).
    expect(support.reason_native).toContain("200 phút");
    db = workerEditItem(
      db,
      made.id,
      "support",
      {
        value_ko: "목욕, 청소, 말벗",
        detail: { minutes: { physical: 60, housework: 60, emotional: 60 } },
      },
      NOW,
    );
    support = db.records[made.id].items.find((item) => item.item_key === "support")!;
    expect(support.status).toBe("observed");
    expect(support.reason_native).toBe("");
  });

  it("AI가 쓴 ‘확인 필요’ 이유는 모국어 번역이 함께 온다", () => {
    let db = createDemoDb(TODAY);
    const made = ensureRecord(db, "kim", TODAY, TODAY, NOW);
    if ("error" in made) throw new Error(made.error);
    db = fillMockDraft(made.db, made.id, NOW);
    const checks = db.records[made.id].items.filter((item) => item.status === "needs_check");
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((item) => (item.reason_native ?? "").trim() !== "")).toBe(true);
  });

  it("같은 어르신·같은 날 기록은 하나만", () => {
    const db = createDemoDb(TODAY);
    const existing = findRecord(db, "kim", addDays(TODAY, -1))!;
    const again = ensureRecord(db, "kim", addDays(TODAY, -1), TODAY, NOW);
    expect(again).toEqual({ db, id: existing.id });
  });
});

describe("timeRangeLabel", () => {
  it("시각 둘을 오전·오후 글자로 바꾼다", () => {
    expect(timeRangeLabel("14:00~17:00")).toBe("오후 2:00 ~ 오후 5:00");
    expect(timeRangeLabel("09:30~12:00")).toBe("오전 9:30 ~ 오후 12:00");
  });
  it("요일 말이 앞에 있어도 NaN 없이 시각만 바꾼다(표시용 schedule)", () => {
    expect(timeRangeLabel("평일 14:00~17:00")).toBe("평일 오후 2:00 ~ 오후 5:00");
    expect(timeRangeLabel("월·수·금 09:00~12:00")).toBe("월·수·금 오전 9:00 ~ 오후 12:00");
  });
  it("시각이 없으면 원문 그대로, 비면 빈 글자", () => {
    expect(timeRangeLabel("매일")).toBe("매일");
    expect(timeRangeLabel(null)).toBe("");
  });
  it("DB time 값(초 포함)도 받는다", () => {
    expect(timeRangeLabel("14:00:00~17:00:00")).toBe("오후 2:00 ~ 오후 5:00");
  });
});

// 이슈 #182: 지원별 분 합 재검사(검사 5)를 실제 서버(support-check.ts)처럼 한다.
describe("Mock 재가 지원 합 재검사", () => {
  const draft = () => {
    const today = "2026-10-30";
    const made = ensureRecord(createDemoDb(today), "lee", today, today, "t0");
    if (!("db" in made)) throw new Error("기록을 만들지 못함");
    const db = fillMockDraft(
      markProcessing(made.db, made.id, "두 시부터 다섯 시까지", "t1"),
      made.id,
      "t2",
    );
    return { db, id: made.id };
  };
  const support = (db: ReturnType<typeof createDemoDb>, id: string) =>
    db.records[id].items.find((item) => item.item_key === "support")!;
  const visit = (db: ReturnType<typeof createDemoDb>, id: string) =>
    db.records[id].items.find((item) => item.item_key === "visit_time")!;

  it("작성자가 분을 늘려 합이 방문 시간을 넘으면 '확인 필요'", () => {
    const { db, id } = draft();
    const item = support(db, id);
    const next = workerEditItem(
      db,
      id,
      "support",
      {
        value_ko: item.value_ko,
        detail: { ...item.detail, minutes: { physical: 200, emotional: 60 } },
      },
      "t3",
    );
    expect(support(next, id).status).toBe("needs_check");
    expect(support(next, id).reason).toContain("260분");
  });

  it("AI가 넣은 분 그대로인데 방문 시간을 줄이면 '확인 필요'(실제 서버와 같음)", () => {
    const { db, id } = draft();
    expect(support(db, id).source).toBe("ai");
    const next = workerEditItem(
      db,
      id,
      "visit_time",
      {
        value_ko: "14:00~14:30 방문",
        detail: { ...visit(db, id).detail, start: "14:00", end: "14:30" },
      },
      "t3",
    );
    expect(support(next, id).status).toBe("needs_check");
    expect(support(next, id).reason).toContain("방문 시간(30분)");
    // AI가 쓴 항목을 덮어쓰지 않는다: 내용·출처는 그대로
    expect(support(next, id).source).toBe("ai");
    expect(support(next, id).value_ko).toBe(support(db, id).value_ko);
  });

  it("방문 시간을 다시 늘리면 코드가 붙인 이유만 걷어 내고 '관찰'로", () => {
    const { db, id } = draft();
    const short = workerEditItem(
      db,
      id,
      "visit_time",
      {
        value_ko: "14:00~14:30 방문",
        detail: { ...visit(db, id).detail, start: "14:00", end: "14:30" },
      },
      "t3",
    );
    const back = workerEditItem(
      short,
      id,
      "visit_time",
      {
        value_ko: "14:00~17:00 방문",
        detail: { ...visit(short, id).detail, start: "14:00", end: "17:00" },
      },
      "t4",
    );
    expect(support(back, id).status).toBe("observed");
    expect(support(back, id).reason).toBe("");
  });
});
