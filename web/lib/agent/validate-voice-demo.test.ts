// 시연 음성(data/demo/voices.md)을 배포본에서 돌린 실제 AI 초안(10/30)으로 서버 검사 9·10과 근거·이유 정리를 확인한다.
// 합성 사례만(실명 없음). 초안은 저장된 값에서 서버가 붙인 이유를 뺀, AI가 낸 모양으로 옮겼다.
import { describe, expect, it } from "vitest";

import {
  type Draft,
  type DraftItem,
  evidenceInTranscript,
  hasVisibleSign,
  ITEM_KEYS,
  type ItemKey,
  REASONS,
  validateDraft,
} from "./validate-draft";

const item = (key: ItemKey, fields: Partial<DraftItem>): DraftItem => ({
  item_key: key,
  value_ko: "",
  value_native: "",
  status: "not_mentioned",
  evidence: "",
  reason: "",
  reason_native: "",
  detail: {},
  ...fields,
});

const draftOf = (
  items: Partial<Record<ItemKey, Partial<DraftItem>>>,
  formFields: Record<string, unknown> = {},
): Draft => ({
  transcript_ko: "",
  items: ITEM_KEYS.map((key) => item(key, items[key] ?? {})),
  form_fields: formFields,
});

// 음성 2 · 이○○ (재가 제12호) 받아쓴 글
const VOICE2 =
  "2시부터 5시까지 3시간 있었어요. 목욕 도와드리는데 1시간 20분 걸렸어요. 청소하고 빨래하는데 1시간 했어요. 간식으로 두유 한 팩을 다 드셨어요. 점심 약은 드셨다고 하셨어요. 오늘은 낮잠을 안 주무셨어요. 오늘은 특별히 아픈 데는 없다고 하셨어요. 한 시간 동안 이야기 나눴는데 오늘이 며칠인지 두 번 물어보셨어요. 다음 방문 때 날짜 물으시는 것 다시 살펴볼게요. 오늘 기록은 여기까지입니다.";

const voice2Draft = (): Draft =>
  draftOf(
    {
      visit_time: {
        status: "observed",
        value_ko: "14:00~17:00 방문",
        evidence: "2시부터 5시까지 3시간 있었어요.",
        detail: { start: "14:00", end: "17:00" },
      },
      support: {
        status: "needs_check",
        value_ko: "목욕도움(몸 씻기 도움) 80분, 가사(청소·빨래) 60분, 정서지원(이야기 나누기) 60분",
        // 원문 2·3번째 문장과 8번째 문장을 이어 붙인 근거
        evidence:
          "목욕 도와드리는데 1시간 20분 걸렸어요. 청소하고 빨래하는데 1시간 했어요. 한 시간 동안 이야기 나눴는데 오늘이 며칠인지 두 번 물어보셨어요.",
        reason:
          "지원별 제공시간 합(목욕 80분+가사 60분+정서지원 60분=200분)이 방문 시간(180분)을 초과함. 실제 제공 시간 확인 필요.",
        reason_native: "Tổng thời gian hỗ trợ (200 phút) vượt quá thời gian thăm (180 phút).",
        detail: { minutes: { physical: 80, housework: 60, emotional: 60 } },
      },
      meal: {
        status: "observed",
        value_ko: "간식으로 두유 한 팩 전량 섭취하심",
        evidence: "간식으로 두유 한 팩을 다 드셨어요.",
      },
      sleep: {
        status: "observed",
        value_ko: "낮잠을 안 주무심",
        evidence: "오늘은 낮잠을 안 주무셨어요.",
      },
      discomfort: {
        status: "observed",
        value_ko: "특별히 아픈 데 없다고 하심",
        evidence: "오늘은 특별히 아픈 데는 없다고 하셨어요.",
      },
      medication: {
        status: "observed",
        value_ko: "점심 약을 드셨다고 하심",
        evidence: "점심 약은 드셨다고 하셨어요.",
      },
      cognition: {
        status: "observed",
        value_ko: "이야기 나누는 중 오늘 날짜를 두 번 반복해서 물어보심",
        evidence: "한 시간 동안 이야기 나눴는데 오늘이 며칠인지 두 번 물어보셨어요.",
        detail: { trend: "same" },
      },
      next_check: {
        status: "observed",
        value_ko: "다음 방문 시 날짜 반복 질문 여부 재확인",
        evidence: "다음 방문 때 날짜 물으시는 것 다시 살펴볼게요.",
      },
    },
    // 배포본 초안이 원문 없이 채운 값
    {
      total_minutes: 180,
      body_trend: "same",
      meal_trend: "same",
      cognition_trend: "same",
      stool_accidents: 0,
      urine_accidents: 0,
    },
  );

const HOME = { transcript: VOICE2, careType: "home" as const, nativeLang: "vi" as const };

describe("음성 2(재가): 검사 9 서식 칸 근거", () => {
  const result = validateDraft(voice2Draft(), HOME);
  const get = (key: ItemKey) => result.fixed!.items.find((i) => i.item_key === key)!;

  it("비교 표현이 없으면 변화상태 3칸과 말하지 않은 실수 횟수를 뺌, 총시간은 남김", () => {
    expect(result.fixed?.form_fields).toEqual({ total_minutes: 180 });
    expect(result.problems.map((p) => p.code)).toContain("form_field_without_evidence");
  });

  it("인지 변화는 '확인 필요' + 이유, detail.trend도 뺌", () => {
    expect(get("cognition").status).toBe("needs_check");
    expect(get("cognition").reason).toBe(REASONS.trendWithoutComparison);
    expect(get("cognition").reason_native).toContain("so sánh");
    expect(get("cognition").detail.trend).toBeUndefined();
  });

  it("제공 지원: 떨어진 문장을 이은 근거도 찾고, 합 이유는 서버 문장 하나만", () => {
    const support = get("support");
    expect(support.status).toBe("needs_check");
    expect(support.reason).not.toContain(REASONS.evidenceNotFound);
    expect(support.reason).toBe(`${REASONS.supportMinutesExceed} (200분 > 180분)`);
    expect(support.reason_native.match(/Tổng thời gian/g)).toHaveLength(1);
  });

  it("'아픈 데는 없다'는 보이는 신호가 아니라 관찰 그대로", () => {
    expect(get("discomfort").status).toBe("observed");
  });

  it("원문에 비교가 있으면 변화상태와 인지 '관찰'을 그대로 둠", () => {
    const compared = validateDraft(voice2Draft(), {
      ...HOME,
      transcript: VOICE2.replace("물어보셨어요.", "물어보셨어요. 평소처럼 웃으셨어요."),
    });
    const cognition = compared.fixed!.items.find((i) => i.item_key === "cognition")!;
    expect(cognition.status).toBe("observed");
    expect(cognition.detail.trend).toBe("same");
    expect(compared.fixed?.form_fields).toMatchObject({ cognition_trend: "same" });
    // 실수 횟수는 비교와 상관없이 원문에 말이 없어 뺌
    expect(compared.fixed?.form_fields).not.toHaveProperty("stool_accidents");
  });

  it("원문에 기저귀·실수 이야기가 있으면 실수 횟수를 둠", () => {
    const withDiaper = validateDraft(voice2Draft(), {
      ...HOME,
      transcript: `${VOICE2} 기저귀는 두 번 갈아 드렸어요.`,
    });
    expect(withDiaper.fixed?.form_fields).toMatchObject({ stool_accidents: 0, urine_accidents: 0 });
  });
});

// 음성 3 · 최○○ (교육용 기관 제16호, 베트남어로 말함)
const VOICE3 =
  "Hôm nay tôi chăm sóc bà từ 7 giờ sáng đến 4 giờ chiều Buổi sáng tôi rửa mặt và thay quần áo cho bà Cứ 2 tiếng tôi đổi tư thế cho bà 1 lần và thay tả 3 lần Bữa trưa bà ăn cháo, ăn được 1 ít Bà nói tối qua bà ngủ không ngon Sau bữa trưa tôi thấy bà uống thuốc Hôm nay bà nhận ra tôi và cười chào tôi Da ở mông của bà hơi đỏ Ngày mai tôi sẽ xem lại da ở mông của bà Hôm nay tôi di đến đây";

describe("음성 3(시설, 베트남어): 검사 10 보이는 신호", () => {
  const draft = draftOf({
    discomfort: {
      status: "observed",
      value_ko: "엉덩이 피부 약간 발적 관찰됨",
      value_native: "Quan sát thấy vùng da mông ông/bà hơi đỏ",
      evidence: "Da ở mông của bà hơi đỏ",
    },
  });

  it("발적을 '관찰'로 두면 '확인 필요'로(음성 1과 같은 결과)", () => {
    const result = validateDraft(draft, {
      transcript: VOICE3,
      careType: "facility",
      nativeLang: "vi",
    });
    const discomfort = result.fixed!.items.find((i) => i.item_key === "discomfort")!;
    expect(discomfort.status).toBe("needs_check");
    expect(discomfort.reason).toBe(REASONS.visibleSign);
    expect(result.problems.map((p) => p.code)).toContain("visible_sign_observed");
  });

  it("시설 기록에는 인지 변화 검사 9를 하지 않음", () => {
    const result = validateDraft(
      draftOf({
        cognition: {
          status: "observed",
          value_ko: "알아보시고 웃으며 인사하심",
          evidence: "Hôm nay bà nhận ra tôi và cười chào tôi",
        },
      }),
      { transcript: VOICE3, careType: "facility" },
    );
    expect(result.fixed!.items.find((i) => i.item_key === "cognition")!.status).toBe("observed");
  });
});

describe("보이는 신호 낱말", () => {
  it.each([
    ["엉덩이 부위 발적 관찰", true],
    ["엉덩이 쪽이 조금 빨개요.", true],
    ["팔에 멍이 있음", true],
    ["Da ở mông của bà hơi đỏ", true],
    ["상처는 없다고 하심", false],
    ["멍 없음", false],
    ["không có vết thương", false],
    ["특별히 아픈 데는 없다고 하심", false],
  ])("%s → %s", (text, expected) => {
    expect(hasVisibleSign(text)).toBe(expected);
  });
});

describe("근거 문장 찾기(여러 문장)", () => {
  it("떨어진 문장을 이어 붙인 근거도 문장마다 원문에 있으면 찾음", () => {
    expect(
      evidenceInTranscript(
        "목욕 도와드리는데 1시간 20분 걸렸어요. 다음 방문 때 날짜 물으시는 것 다시 살펴볼게요.",
        VOICE2,
      ),
    ).toBe(true);
  });
  it("한 문장이라도 원문에 없으면 못 찾음", () => {
    expect(
      evidenceInTranscript("목욕 도와드리는데 1시간 20분 걸렸어요. 저녁 약도 드셨어요.", VOICE2),
    ).toBe(false);
  });
});
