// 시험용 기록 초안(합성). AI를 부르지 않고 서버 저장 함수(save_record_ai_draft)로 바로 넣는다.
// 내용은 data/cases의 S-F01(시설)·S-H01(재가)을 줄여 옮긴 것이다. 실명 없음.
import type { Draft, DraftItem, ItemKey } from "@/lib/agent/validate-draft";

export type { Draft, DraftItem, ItemKey };

const empty = (item_key: ItemKey): DraftItem => ({
  item_key,
  status: "not_mentioned",
  value_ko: "",
  value_native: "",
  evidence: "",
  reason: "",
  reason_native: "",
  detail: {},
});

/** 시설(제16호): '확인 필요' 2개(식사·불편감), 관찰 4개, 언급 없음 3개 */
export const FACILITY_TRANSCRIPT =
  "아침에 세수해 드리고 두 시간마다 자세 바꿨어요. 점심은 조금 드셨어요. 밤에 잘 못 주무셨어요. 약은 드셨어요. 엉덩이 쪽이 조금 빨개요.";

export function facilityDraft(): Draft {
  return {
    transcript_ko: FACILITY_TRANSCRIPT,
    form_fields: {},
    items: [
      empty("visit_time"),
      {
        ...empty("support"),
        status: "observed",
        value_ko: "세면 도움, 체위변경(2시간마다)",
        value_native: "Hỗ trợ rửa mặt, đổi tư thế (mỗi 2 giờ)",
        evidence: "아침에 세수해 드리고 두 시간마다 자세 바꿨어요.",
      },
      {
        ...empty("meal"),
        status: "needs_check",
        value_ko: "점심 섭취",
        value_native: "Bữa trưa đã ăn",
        evidence: "점심은 조금 드셨어요.",
        reason: "‘조금’은 섭취량(1 / 1/2 이상 / 1/2 미만) 중 하나로 정할 수 없음",
        reason_native: "Không xác định được lượng ăn từ ‘một ít’",
      },
      {
        ...empty("sleep"),
        status: "observed",
        value_ko: "밤에 잘 못 주무심",
        value_native: "Đêm qua ngủ không ngon",
        evidence: "밤에 잘 못 주무셨어요.",
      },
      {
        ...empty("discomfort"),
        status: "needs_check",
        value_ko: "엉덩이 쪽 피부가 조금 붉어 보임",
        value_native: "Da vùng mông hơi đỏ",
        evidence: "엉덩이 쪽이 조금 빨개요.",
        reason: "피부 이상 신호라 관리자 확인이 필요함",
        reason_native: "Dấu hiệu bất thường trên da, cần người quản lý xác nhận",
      },
      {
        ...empty("medication"),
        status: "observed",
        value_ko: "약 드신 것 확인함",
        value_native: "Đã xác nhận uống thuốc",
        evidence: "약은 드셨어요.",
      },
      empty("cognition"),
      {
        ...empty("notes"),
        status: "observed",
        value_ko: "약 드신 것 확인함. 엉덩이 쪽 피부가 조금 붉어 보임.",
        value_native: "Đã uống thuốc. Da vùng mông hơi đỏ.",
        evidence: "약은 드셨어요. 엉덩이 쪽이 조금 빨개요.",
      },
      empty("next_check"),
    ],
  };
}

/** 재가(제12호): 방문 14:00~17:00, 정서지원 60분, '확인 필요' 1개(인지) */
export const HOME_TRANSCRIPT =
  "두 시부터 다섯 시까지 있었어요. 목욕 도와드리고 청소했어요. 한 시간 동안 이야기 나눴는데 오늘이 며칠인지 두 번 물어보셨어요.";

export function homeDraft(): Draft {
  return {
    transcript_ko: HOME_TRANSCRIPT,
    form_fields: { stool_accidents: null, urine_accidents: null },
    items: [
      {
        ...empty("visit_time"),
        status: "observed",
        value_ko: "14:00~17:00 방문 (180분)",
        value_native: "Thăm từ 14:00 đến 17:00 (180 phút)",
        evidence: "두 시부터 다섯 시까지 있었어요.",
        detail: { start: "14:00", end: "17:00" },
      },
      {
        ...empty("support"),
        status: "observed",
        value_ko: "몸 씻기 도움(목욕), 청소, 말벗 1시간",
        value_native: "Hỗ trợ tắm, dọn dẹp, trò chuyện 1 giờ",
        evidence: "목욕 도와드리고 청소했어요. 한 시간 동안 이야기 나눴는데",
        detail: {
          checks: ["몸 씻기 도움", "식사준비, 청소 및 주변정리 정돈, 세탁 등"],
          minutes: { emotional: 60 },
        },
      },
      empty("meal"),
      empty("sleep"),
      empty("discomfort"),
      empty("medication"),
      {
        ...empty("cognition"),
        status: "needs_check",
        value_ko: "오늘 날짜를 두 번 물으심",
        value_native: "Hỏi ngày hôm nay hai lần",
        evidence: "오늘이 며칠인지 두 번 물어보셨어요.",
        reason: "비교 표현이 없어 인지기능 변화(호전/유지/악화)를 정할 수 없음",
        reason_native: "Không có so sánh nên không xác định được thay đổi nhận thức",
      },
      empty("notes"),
      empty("next_check"),
    ],
  };
}

/** 초안 일부를 바꾼 사본. 예: withItem(facilityDraft(), "sleep", { value_ko: "" }) */
export function withItem(draft: Draft, key: ItemKey, patch: Partial<DraftItem>): Draft {
  return {
    ...draft,
    items: draft.items.map((item) => (item.item_key === key ? { ...item, ...patch } : item)),
  };
}
