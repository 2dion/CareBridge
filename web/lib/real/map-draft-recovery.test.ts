import { describe, expect, it } from "vitest";

import {
  draftStateOf,
  draftTouched,
  inputModeOf,
  PROCESSING_LIMIT_MS,
  itemsSnapshot,
  textRunStateOf,
} from "./map";

// 이슈 #234·#235·#237: 정리 중·실패 판정
type Args = Parameters<typeof draftStateOf>;
type Items = Args[1];
type Jobs = Args[2];

const START = Date.parse("2026-10-31T01:00:00.000Z");
const created_at = new Date(START).toISOString();
const record = { id: "rec-1", transcript: "" } as Args[0];
const withText = { ...record, transcript: "원문" };
const job = (status: string, at = created_at, target = "record") =>
  ({ record_id: "rec-1", target, status, created_at: at }) as Jobs[number];
const blank = { source: "ai", status: "not_mentioned", confirmed_by_worker: false };
const items = (overrides: Record<string, unknown> = {}) =>
  [blank, { ...blank, ...overrides }] as unknown as Items;

describe("draftStateOf 시간 제한", () => {
  it.each(["uploaded", "transcribing", "filling"])(
    "%s: 6분 안이면 processing, 6분이 지나면 failed",
    (status) => {
      const at = (now: number) => draftStateOf(record, [], [job(status)], now);
      expect(at(START + 5 * 60_000)).toBe("processing");
      expect(at(START + PROCESSING_LIMIT_MS)).toBe("processing");
      expect(at(START + PROCESSING_LIMIT_MS + 1)).toBe("failed");
      expect(at(START + 7 * 60_000)).toBe("failed");
    },
  );

  it("제한 값은 6분이고 maxDuration(300초)보다 길다", () => {
    expect(PROCESSING_LIMIT_MS).toBe(360_000);
  });

  it("작업이 done으로 정리되면(#234) 항목이 있을 때 ready", () => {
    const touched = items({ status: "observed" });
    expect(draftStateOf(withText, touched, [job("done")], START + 3_600_000)).toBe("ready");
  });

  it("옛 실패 뒤의 새 작업은 마지막 작업으로 판정", () => {
    const old = job("failed", "2026-10-31T00:00:00.000Z");
    expect(draftStateOf(record, [], [old, job("filling")], START + 60_000)).toBe("processing");
  });

  it("항목 작업(target=item)은 판정에 쓰지 않는다", () => {
    expect(draftStateOf(record, [], [job("filling", created_at, "item")], START)).toBe("empty");
  });
});

describe("draftTouched", () => {
  it("빈 AI 항목만 있으면 false", () => {
    expect(draftTouched(items())).toBe(false);
    expect(draftTouched([])).toBe(false);
  });

  it.each([
    ["AI 관찰", { status: "observed" }],
    ["확인 필요", { status: "needs_check" }],
    ["작성자 출처", { source: "worker" }],
    ["관리자 출처", { source: "reviewer" }],
    ["해당 없음 확인", { confirmed_by_worker: true }],
  ])("%s면 true", (_, overrides) => {
    expect(draftTouched(items(overrides))).toBe(true);
  });
});

describe("textRunStateOf", () => {
  const RUN = { startedAt: START, snapshot: itemsSnapshot(items()) };

  it("이미 항목이 있는 기록을 재처리해도 항목이 그대로면 정리 중이고, 달라지면 끝난다", () => {
    const before = items({ status: "observed" });
    const run = { startedAt: START, snapshot: itemsSnapshot(before) };
    expect(textRunStateOf(before, run, START)).toBe("processing");
    expect(textRunStateOf(items({ status: "needs_check" }), run, START)).toBeNull();
  });

  it("초안이 없으면 6분까지 processing, 넘으면 failed", () => {
    expect(textRunStateOf(items(), RUN, START)).toBe("processing");
    expect(textRunStateOf(items(), RUN, START + PROCESSING_LIMIT_MS)).toBe("processing");
    expect(textRunStateOf(items(), RUN, START + PROCESSING_LIMIT_MS + 1)).toBe("failed");
  });

  it("초안이 생겼으면 null(끝남)", () => {
    expect(textRunStateOf(items({ status: "observed" }), RUN, START)).toBeNull();
    expect(textRunStateOf(items({ status: "observed" }), RUN, START + 3_600_000)).toBeNull();
  });

  it("같은 항목이어도 재시도 전 실패 작업이 done으로 바뀌면 끝난다(#296)", () => {
    const before = items({ status: "observed" });
    const run = { startedAt: START, snapshot: itemsSnapshot(before), pendingJobs: [created_at] };
    expect(textRunStateOf(before, run, START, [job("failed")])).toBe("processing");
    expect(textRunStateOf(before, run, START + 60_000, [job("done")])).toBeNull();
    // 새로고침해 세션에 남긴 실행을 읽어도 같은 결과다.
    expect(
      textRunStateOf(before, JSON.parse(JSON.stringify(run)), START + 400_000, [job("done")]),
    ).toBeNull();
  });

  it("예전 done·항목 작업은 이번 실행의 완료로 보지 않는다", () => {
    const run = { ...RUN, pendingJobs: [created_at] };
    expect(textRunStateOf(items(), run, START, [job("done", "2026-10-30T00:00:00Z")])).toBe(
      "processing",
    );
    expect(textRunStateOf(items(), run, START, [job("done", created_at, "item")])).toBe(
      "processing",
    );
    expect(textRunStateOf(items(), RUN, START, [job("done")])).toBe("processing");
  });

  it("처음엔 빈 음성 기록도 같은 빈 결과가 저장되면 작업 완료로 풀린다", () => {
    const run = { ...RUN, pendingJobs: [created_at] };
    expect(textRunStateOf(items(), run, START, [job("done")])).toBeNull();
  });
});

describe("inputModeOf (#135 유지)", () => {
  it("녹음 작업이 done이어도 음성, 작업이 없으면 글", () => {
    expect(inputModeOf(withText, [job("done")])).toBe("voice");
    expect(inputModeOf(withText, [])).toBe("text");
    expect(inputModeOf(record, [])).toBeNull();
  });
});
