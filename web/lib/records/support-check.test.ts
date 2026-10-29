import { describe, expect, it, vi } from "vitest";

import { REASONS } from "@/lib/agent/validate-draft";

import {
  recheckSupportMinutes,
  supportMinutesPatch,
  type SupportCheckDeps,
  type SupportCheckTarget,
} from "./support-check";

// 시나리오 2(이슈 #116): 14:00~17:00 방문(180분)인데 작성자가 신체 80, 정서 60, 가사 60을 직접 넣음
const EXCEED = { physical: 80, emotional: 60, housework: 60 };
const FITS = { physical: 60, emotional: 60, housework: 60 };

function target(overrides: Partial<SupportCheckTarget> = {}): SupportCheckTarget {
  return {
    careType: "home",
    nativeLang: "vi",
    visitMinutes: 180,
    support: {
      value_ko: "목욕, 청소·빨래, 말벗·격려 제공하였음.",
      status: "observed",
      reason: "",
      reason_native: "",
      detail: { minutes: EXCEED },
    },
    ...overrides,
  };
}

describe("supportMinutesPatch", () => {
  it("작성자가 넣은 분 합(200)이 방문 시간(180)보다 길면 확인 필요 + 이유(한국어·모국어)", () => {
    const patch = supportMinutesPatch(target());
    expect(patch).toEqual({
      status: "needs_check",
      reason: `${REASONS.supportMinutesExceed} (200분 > 180분)`,
      reason_native: "Tổng thời gian hỗ trợ dài hơn thời gian thăm (200분 > 180분)",
    });
  });

  it("합이 방문 시간 이하이고 서버 이유가 없으면 손대지 않음", () => {
    const fits = target();
    fits.support.detail = { minutes: FITS };
    expect(supportMinutesPatch(fits)).toBeNull();
  });

  it("분을 고쳐 합이 맞으면 서버가 붙였던 이유를 걷고 '관찰'로 돌림", () => {
    const fixed = target({
      support: {
        value_ko: "목욕, 청소·빨래, 말벗·격려 제공하였음.",
        status: "needs_check",
        reason: `${REASONS.supportMinutesExceed} (200분 > 180분)`,
        reason_native: "Tổng thời gian hỗ trợ dài hơn thời gian thăm (200분 > 180분)",
        detail: { minutes: FITS },
      },
    });
    expect(supportMinutesPatch(fixed)).toEqual({
      status: "observed",
      reason: "",
      reason_native: "",
    });
  });

  it("AI가 쓴 이유는 남기고 서버 이유만 바꿈", () => {
    const mixed = target({
      support: {
        value_ko: "목욕 도움.",
        status: "needs_check",
        reason: `'씻겨 드림'을 목욕으로 짐작; ${REASONS.visitMinutesMissing}`,
        reason_native:
          "Đoán 'tắm rửa' là tắm; Không có thời gian thăm để kiểm tra tổng thời gian hỗ trợ",
        detail: { minutes: EXCEED },
      },
    });
    expect(supportMinutesPatch(mixed)).toEqual({
      status: "needs_check",
      reason: `'씻겨 드림'을 목욕으로 짐작; ${REASONS.supportMinutesExceed} (200분 > 180분)`,
      reason_native:
        "Đoán 'tắm rửa' là tắm; Tổng thời gian hỗ trợ dài hơn thời gian thăm (200분 > 180분)",
    });
    const fits = { ...mixed, support: { ...mixed.support, detail: { minutes: FITS } } };
    expect(supportMinutesPatch(fits)).toEqual({
      status: "needs_check",
      reason: "'씻겨 드림'을 목욕으로 짐작",
      reason_native: "Đoán 'tắm rửa' là tắm",
    });
  });

  it("이미 같은 이유로 확인 필요면 바꿀 것이 없음(null)", () => {
    const same = target({
      support: {
        value_ko: "목욕 도움.",
        status: "needs_check",
        reason: `${REASONS.supportMinutesExceed} (200분 > 180분)`,
        reason_native: "Tổng thời gian hỗ trợ dài hơn thời gian thăm (200분 > 180분)",
        detail: { minutes: EXCEED },
      },
    });
    expect(supportMinutesPatch(same)).toBeNull();
  });

  it("방문 시간을 모르는데 분이 있으면 확인 필요(방문 시간 없음)", () => {
    const patch = supportMinutesPatch(target({ visitMinutes: null }));
    expect(patch?.status).toBe("needs_check");
    expect(patch?.reason).toBe(REASONS.visitMinutesMissing);
  });

  it("시설 기록은 검사하지 않음", () => {
    expect(supportMinutesPatch(target({ careType: "facility" }))).toBeNull();
  });

  it("작성자 언어가 한국어면 번역 칸에도 한국어 이유", () => {
    const patch = supportMinutesPatch(target({ nativeLang: "ko" }));
    expect(patch?.reason_native).toBe(`${REASONS.supportMinutesExceed} (200분 > 180분)`);
  });
});

describe("recheckSupportMinutes", () => {
  it("바뀐 것이 있으면 지금 value_ko를 기준 글로 save_ai_item(check)에 넘김", async () => {
    const deps: SupportCheckDeps = {
      readTarget: vi.fn(async () => target()),
      applyCheck: vi.fn(async () => {}),
    };
    const patch = await recheckSupportMinutes("rec-1", "worker-1", deps);
    expect(patch?.status).toBe("needs_check");
    expect(deps.applyCheck).toHaveBeenCalledWith(
      "rec-1",
      "worker-1",
      "목욕, 청소·빨래, 말벗·격려 제공하였음.",
      patch,
    );
  });

  it("재가가 아니거나 바뀔 것이 없으면 저장하지 않음", async () => {
    const deps: SupportCheckDeps = {
      readTarget: vi.fn(async () => null),
      applyCheck: vi.fn(async () => {}),
    };
    expect(await recheckSupportMinutes("rec-1", "worker-1", deps)).toBeNull();
    expect(deps.applyCheck).not.toHaveBeenCalled();
  });
});
