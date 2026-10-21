import { describe, expect, it } from "vitest";

import {
  allNeedsCheckDraft,
  type Draft,
  type DraftItem,
  evidenceInTranscript,
  ITEM_KEYS,
  type ItemKey,
  REASONS,
  sumSupportMinutes,
  validateDraft,
  type ValidateContext,
} from "./validate-draft";

// 시나리오 1(시설 기록 한 건)의 말할 문장. 합성 사례다(문서/설계/시연-일정-v1.1.md).
const TRANSCRIPT =
  "아침에 세수해 드리고 두 시간마다 자세 바꿨어요. 점심은 조금 드셨어요. Bà ngủ không ngon. 약은 드셨어요. 엉덩이 쪽이 조금 빨개요.";

const FACILITY: ValidateContext = { transcript: TRANSCRIPT, careType: "facility" };

const empty = (key: ItemKey): DraftItem => ({
  item_key: key,
  value_ko: "",
  value_native: "",
  status: "not_mentioned",
  evidence: "",
  reason: "",
  detail: {},
});

// 시나리오 1에서 기대하는 초안 (시연-일정-v1.1 4단계)
function scenarioOneDraft(): Draft {
  const items: Record<ItemKey, DraftItem> = {
    visit_time: empty("visit_time"),
    support: {
      ...empty("support"),
      value_ko: "세면 도움, 2시간마다 체위변경 하심.",
      status: "observed",
      evidence: "아침에 세수해 드리고 두 시간마다 자세 바꿨어요.",
    },
    meal: {
      ...empty("meal"),
      value_ko: "점심 조금 드심.",
      status: "needs_check",
      evidence: "점심은 조금 드셨어요.",
      reason: "'조금'이 모호해 섭취량을 고를 수 없음",
    },
    sleep: {
      ...empty("sleep"),
      value_ko: "밤에 잘 못 주무심.",
      status: "observed",
      evidence: "Bà ngủ không ngon.",
    },
    discomfort: {
      ...empty("discomfort"),
      value_ko: "엉덩이 부위 발적 관찰.",
      status: "needs_check",
      evidence: "엉덩이 쪽이 조금 빨개요.",
      reason: "피부 이상 신호",
    },
    medication: {
      ...empty("medication"),
      value_ko: "약 드심.",
      status: "observed",
      evidence: "약은 드셨어요.",
    },
    cognition: empty("cognition"),
    notes: empty("notes"),
    next_check: empty("next_check"),
  };
  return { transcript_ko: TRANSCRIPT, items: ITEM_KEYS.map((key) => items[key]), form_fields: {} };
}

const withItem = (draft: Draft, key: ItemKey, patch: Partial<DraftItem>): Draft => ({
  ...draft,
  items: draft.items.map((item) => (item.item_key === key ? { ...item, ...patch } : item)),
});

const codes = (draft: unknown, ctx: ValidateContext = FACILITY) =>
  validateDraft(draft, ctx).problems.map((p) => p.code);

describe("validateDraft: 통과", () => {
  it("시나리오 1 초안은 문제 없이 통과", () => {
    const result = validateDraft(scenarioOneDraft(), FACILITY);
    expect(result.problems).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.downgraded).toEqual([]);
    expect(result.fixed?.items.map((i) => i.item_key)).toEqual([...ITEM_KEYS]);
  });
});

describe("검사 1: JSON 형식과 9개 항목", () => {
  it("draft가 객체가 아니면 고칠 수 없음 (fixed = null)", () => {
    const result = validateDraft("not json", FACILITY);
    expect(result.passed).toBe(false);
    expect(result.fixed).toBeNull();
    expect(result.problems[0].code).toBe("invalid_shape");
  });

  it("항목이 빠지면 빠진 항목을 알려 줌", () => {
    const draft = scenarioOneDraft();
    draft.items = draft.items.filter((i) => i.item_key !== "cognition");
    const result = validateDraft(draft, FACILITY);
    expect(result.fixed).toBeNull();
    expect(result.problems).toContainEqual(
      expect.objectContaining({ code: "missing_item", item_key: "cognition" }),
    );
  });

  it("같은 항목이 두 번이면 실패", () => {
    const draft = scenarioOneDraft();
    draft.items.push({ ...draft.items[0] });
    expect(codes(draft)).toContain("duplicate_item");
  });

  it("9개 키가 아닌 항목(예: mood)은 실패", () => {
    const draft = scenarioOneDraft() as unknown as { items: unknown[] };
    draft.items.push({ item_key: "mood", status: "observed" });
    expect(codes(draft)).toContain("unknown_item");
  });

  it("순서만 다르면 순서를 맞춰 고침", () => {
    const draft = scenarioOneDraft();
    draft.items.reverse();
    const result = validateDraft(draft, FACILITY);
    expect(result.problems.map((p) => p.code)).toEqual(["wrong_order"]);
    expect(result.fixed?.items.map((i) => i.item_key)).toEqual([...ITEM_KEYS]);
  });

  it("status 값이 틀리면 그 항목을 확인 필요로", () => {
    const draft = withItem(scenarioOneDraft(), "sleep", {
      status: "maybe" as DraftItem["status"],
    });
    const result = validateDraft(draft, FACILITY);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ code: "invalid_field", item_key: "sleep" }),
    );
    expect(result.downgraded).toContain("sleep");
  });
});

describe("검사 2: 근거 문장이 원문에 있는지", () => {
  it("원문에 없는 근거면 확인 필요로 낮추고 이유를 남김", () => {
    const draft = withItem(scenarioOneDraft(), "medication", {
      evidence: "저녁 약도 드셨어요.",
    });
    const result = validateDraft(draft, FACILITY);
    const medication = result.fixed?.items.find((i) => i.item_key === "medication");
    expect(medication?.status).toBe("needs_check");
    expect(medication?.reason).toContain(REASONS.evidenceNotFound);
    expect(result.downgraded).toEqual(["medication"]);
  });

  it("띄어쓰기·문장부호만 다르면 같은 근거로 봄", () => {
    expect(evidenceInTranscript("약은  드셨어요", TRANSCRIPT)).toBe(true);
    expect(evidenceInTranscript("“점심은 조금 드셨어요”", TRANSCRIPT)).toBe(true);
  });

  it("베트남어 근거도 원문과 비교", () => {
    expect(evidenceInTranscript("Bà ngủ không ngon", TRANSCRIPT)).toBe(true);
  });

  it("빈 근거는 원문에 있다고 보지 않음", () => {
    expect(evidenceInTranscript("  ", TRANSCRIPT)).toBe(false);
  });
});

describe("검사 3: '관찰'인데 근거 없음", () => {
  it("확인 필요로 낮춤", () => {
    const draft = withItem(scenarioOneDraft(), "sleep", { evidence: "" });
    const result = validateDraft(draft, FACILITY);
    expect(codes(draft)).toContain("observed_without_evidence");
    expect(result.fixed?.items.find((i) => i.item_key === "sleep")?.status).toBe("needs_check");
  });
});

describe("검사 4: '언급 없음'인데 내용 있음", () => {
  it("내용을 비움 (지어낸 내용 막기)", () => {
    const draft = withItem(scenarioOneDraft(), "cognition", {
      value_ko: "기억력이 나빠지심.",
      value_native: "Trí nhớ kém đi.",
    });
    const result = validateDraft(draft, FACILITY);
    const cognition = result.fixed?.items.find((i) => i.item_key === "cognition");
    expect(codes(draft)).toContain("not_mentioned_with_value");
    expect(cognition?.value_ko).toBe("");
    expect(cognition?.value_native).toBe("");
    expect(cognition?.status).toBe("not_mentioned");
  });
});

describe("검사 5: 재가 제공시간 합 ≤ 방문 시간", () => {
  // 시나리오 2: 14:00~17:00 방문(180분)인데 지원별 분 합이 200분
  const HOME: ValidateContext = { transcript: TRANSCRIPT, careType: "home", visitMinutes: 180 };
  const withMinutes = (minutes: Record<string, number>) =>
    withItem(scenarioOneDraft(), "support", { detail: { minutes } });

  it("합이 방문 시간보다 크면 제공 지원을 확인 필요로", () => {
    const result = validateDraft(withMinutes({ physical: 60, housework: 80, emotional: 60 }), HOME);
    const support = result.fixed?.items.find((i) => i.item_key === "support");
    expect(result.problems.map((p) => p.code)).toContain("support_minutes_exceed_visit");
    expect(support?.status).toBe("needs_check");
    expect(support?.reason).toContain("200분 > 180분");
  });

  it("합이 방문 시간과 같으면 통과", () => {
    expect(codes(withMinutes({ physical: 60, housework: 60, emotional: 60 }), HOME)).toEqual([]);
  });

  it("방문 시간이 없으면 form_fields.total_minutes를 씀", () => {
    const draft = { ...withMinutes({ physical: 100 }), form_fields: { total_minutes: 90 } };
    const ctx: ValidateContext = { transcript: TRANSCRIPT, careType: "home" };
    expect(codes(draft, ctx)).toContain("support_minutes_exceed_visit");
  });

  it("시설은 시간 합을 검사하지 않음", () => {
    expect(codes(withMinutes({ physical: 999 }), { ...FACILITY, visitMinutes: 180 })).toEqual([]);
  });

  it("숫자가 아닌 값은 더하지 않음", () => {
    expect(sumSupportMinutes({ minutes: { a: 30, b: "40", c: Number.NaN } })).toBe(30);
    expect(sumSupportMinutes({})).toBe(0);
  });
});

describe("검사 6: 실명", () => {
  const ctx: ValidateContext = { ...FACILITY, blockedNames: ["홍길순", "김○○", "이"] };

  it("기록 내용에 등록된 이름이 있으면 확인 필요로", () => {
    const draft = withItem(scenarioOneDraft(), "notes", {
      value_ko: "홍길순 어르신 엉덩이 발적.",
      status: "observed",
      evidence: "엉덩이 쪽이 조금 빨개요.",
    });
    const result = validateDraft(draft, ctx);
    expect(result.problems.map((p) => p.code)).toContain("real_name");
    expect(result.downgraded).toContain("notes");
  });

  it("가명(○)과 한 글자 이름은 검사하지 않음 (오탐 방지)", () => {
    expect(codes(scenarioOneDraft(), ctx)).toEqual([]);
  });

  it("문제 메시지에 이름을 그대로 적지 않음", () => {
    const draft = withItem(scenarioOneDraft(), "notes", {
      value_ko: "홍길순 어르신",
      status: "needs_check",
    });
    const messages = validateDraft(draft, ctx)
      .problems.map((p) => p.message)
      .join(" ");
    expect(messages).not.toContain("홍길순");
  });
});

describe("allNeedsCheckDraft", () => {
  it("9개 모두 확인 필요 + 이유", () => {
    const draft = allNeedsCheckDraft("자동 정리 중단");
    expect(draft.items).toHaveLength(9);
    expect(
      draft.items.every((i) => i.status === "needs_check" && i.reason === "자동 정리 중단"),
    ).toBe(true);
  });
});
