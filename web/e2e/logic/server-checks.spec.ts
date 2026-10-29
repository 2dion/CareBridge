// 서버 검사 함수(validate_draft)와 서식 기준 점검. 키·계정·DB 없이 돈다.
// 이슈의 '끝난 기준' 중 코드로 판정할 수 있는 것. 아직 안 고친 이슈는 실패하는 것이 정상이다.
import { expect, test } from "@playwright/test";

import { getFormSpec } from "@/lib/agent/form-spec";
import { validateDraft } from "@/lib/agent/validate-draft";
import type { DemoRecord } from "@/lib/demo/store";
import { printFields } from "@/lib/print/fields";

import {
  facilityDraft,
  FACILITY_TRANSCRIPT,
  homeDraft,
  HOME_TRANSCRIPT,
  withItem,
} from "../support/drafts";

const facility = { transcript: FACILITY_TRANSCRIPT, careType: "facility" as const };
const home = { transcript: HOME_TRANSCRIPT, careType: "home" as const, visitMinutes: 180 };

const problemsOf = (result: ReturnType<typeof validateDraft>, key: string) =>
  result.problems.filter((problem) => problem.item_key === key);
const fixedItem = (result: ReturnType<typeof validateDraft>, key: string) =>
  result.fixed?.items.find((item) => item.item_key === key);

test.describe("기준 초안", () => {
  test("시험용 시설·재가 초안은 서버 검사를 그대로 통과한다(점검 도구 자체 확인)", () => {
    expect(validateDraft(facilityDraft(), facility).problems).toEqual([]);
    expect(validateDraft(homeDraft(), home).problems).toEqual([]);
  });
});

test.describe("[#133] 식사 섭취량 값", () => {
  const PRINT_KEYS = ["full", "half_or_more", "under_half"];

  test("AI가 받는 섭취량 선택지가 인쇄가 찍는 값(full·half_or_more·under_half)을 쓴다", () => {
    const choices = getFormSpec("facility").choices.intake ?? [];
    for (const key of PRINT_KEYS) {
      expect(
        choices.some((choice) => choice.includes(key)),
        `선택지 ${JSON.stringify(choices)}에 ${key}가 없음`,
      ).toBe(true);
    }
  });

  // 섭취량을 정한 '관찰' 식사에 잘못된 값이 들어온 경우
  const observedMeal = (intake: string) =>
    withItem(facilityDraft(), "meal", {
      status: "observed",
      reason: "",
      reason_native: "",
      value_ko: "점심 일반식 섭취",
      detail: { meal_type: "일반식", intake },
    });

  for (const bad of ["needs_check", "1/2 이상", "조금"]) {
    test(`섭취량 값 "${bad}": 서버 검사에 걸리고, 그 값이 남지 않고, 식사가 '확인 필요'가 된다`, () => {
      const result = validateDraft(observedMeal(bad), facility);
      expect(problemsOf(result, "meal").length, "식사 항목에 문제가 하나 이상").toBeGreaterThan(0);
      const meal = fixedItem(result, "meal");
      expect(meal?.status).toBe("needs_check");
      const intake = meal?.detail?.intake;
      expect(intake === undefined || intake === null || PRINT_KEYS.includes(String(intake))).toBe(
        true,
      );
    });
  }

  test('섭취량 값 "half_or_more"는 문제 없이 통과한다', () => {
    expect(problemsOf(validateDraft(observedMeal("half_or_more"), facility), "meal")).toEqual([]);
  });
});

test.describe("[#141] 내용이 빈 '확인 필요'", () => {
  test("'확인 필요'인데 value_ko가 비면 서버 검사가 문제로 알린다", () => {
    const draft = withItem(facilityDraft(), "sleep", {
      status: "needs_check",
      value_ko: "",
      value_native: "",
      reason: "간접 전달이라 직접 확인이 필요함",
    });
    expect(problemsOf(validateDraft(draft, facility), "sleep").length).toBeGreaterThan(0);
  });
});

test.describe("[#117] 기록 내용에 확인 요청 문장", () => {
  for (const sentence of ["섭취량 확인 필요(반 그릇)", "공식 용어 확인 필요", "양이 불명확함"]) {
    test(`value_ko에 "${sentence}"가 있으면 서버 검사가 걸러 낸다`, () => {
      const draft = withItem(facilityDraft(), "meal", { value_ko: `점심 섭취. ${sentence}` });
      expect(problemsOf(validateDraft(draft, facility), "meal").length).toBeGreaterThan(0);
    });
  }
});

test.describe("[#116] 재가 제공시간 합", () => {
  test("지원별 분 합이 방문 시간(180분)보다 길면 제공 지원이 '확인 필요'가 된다", () => {
    const draft = withItem(homeDraft(), "support", {
      detail: { checks: [], minutes: { physical: 80, housework: 60, emotional: 60 } },
    });
    const result = validateDraft(draft, home);
    expect(problemsOf(result, "support").map((p) => p.code)).toContain(
      "support_minutes_exceed_visit",
    );
    expect(fixedItem(result, "support")?.status).toBe("needs_check");
  });

  test("합이 방문 시간 이하이면 '확인 필요'를 만들지 않는다", () => {
    const draft = withItem(homeDraft(), "support", {
      detail: { checks: [], minutes: { physical: 60, housework: 60, emotional: 60 } },
    });
    expect(problemsOf(validateDraft(draft, home), "support")).toEqual([]);
  });
});

test.describe("[#123] 제12호 인쇄 체크 칸", () => {
  // AI가 실제로 낸 모양: 체크 이름이 "목욕"·"청소"·"빨래"이고 가사 분이 있음
  const record = {
    formType: "12",
    careDate: "2026-10-29",
    formFields: { stool_accidents: 0, urine_accidents: 0 },
    items: [
      {
        item_key: "visit_time",
        status: "observed",
        resolution: null,
        value_ko: "14:00~17:00 방문 (180분)",
        detail: { start: "14:00", end: "17:00" },
      },
      {
        item_key: "support",
        status: "observed",
        resolution: null,
        value_ko: "목욕 도움, 청소·빨래, 말벗",
        detail: {
          checks: ["목욕", "청소", "빨래"],
          minutes: { physical: 80, housework: 60, emotional: 60 },
        },
      },
    ],
  } as unknown as DemoRecord;
  const { fields, marks } = printFields(record, "시험 ○○ 어르신", "시험 요양센터", "");
  const hasMark = (top: number) => marks.some((mark) => mark.x === 278 && mark.top === top);

  test("\"목욕\"이 '몸 씻기 도움' 칸에 체크된다", () => {
    expect(hasMark(298)).toBe(true);
  });

  test("가사 분이 있으면 '식사준비, 청소 및 주변정리 정돈, 세탁 등' 칸이 체크된다", () => {
    expect(hasMark(512)).toBe(true);
  });

  test("총시간 칸이 방문 시간(180분)과 같다", () => {
    expect(fields.find((field) => field.key === "total")?.text).toBe("180");
  });
});
