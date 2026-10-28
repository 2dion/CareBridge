// ① get_form_spec(서식 기준 조회)이 돌려주는 서식 기준. 표 없이 서버 코드 안 JSON으로 둔다(결정 2026-10-21-용어표).
// 근거: 문서/설계/데이터구조-v1.6.3.md '서식 칸 대응'(verified 표, 항목별 칸, form_fields, support detail)

import type { CareType } from "./validate-draft";

export type FormSpec = {
  form: string;
  verified: "verified" | "provisional";
  items: Record<string, string>;
  form_fields: Record<string, string>;
  choices: Record<string, string[]>;
  rules: string[];
};

const FACILITY: FormSpec = {
  form: "별지 제16호 (시설, 2019.9.27판)",
  verified: "verified",
  items: {
    visit_time: "월/일, 맺음의 입·퇴소·외박·외출 시간",
    support:
      "신체활동지원 체크(세면 등, 목욕, 체위변경, 화장실, 이동, 산책/외출), 인지관리 및 의사소통 체크. detail.checks에 목록. 분(minutes)은 쓰지 않음",
    meal: "신체활동지원 > 식사 종류·섭취량(1 / 1/2이상 / 1/2미만). detail.intake",
    sleep: "신체활동지원 특이사항",
    discomfort: "신체활동지원 특이사항",
    medication: "요양보호사는 본 것만 신체활동지원 특이사항에. 간호 행위를 추정하지 않음",
    cognition: "인지관리 및 의사소통 특이사항 (호전·유지·악화 칸 없음)",
    notes:
      "영역별 특이사항 4칸(신체활동지원 / 인지관리 및 의사소통 / 건강 및 간호관리 / 기능회복훈련) 중 해당 영역",
    next_check: "칸 없음 (기관 내부 메모)",
  },
  form_fields: {},
  choices: { intake: ["1", "1/2 이상", "1/2 미만"] },
  rules: [
    "form_fields는 빈 객체로 둔다",
    "화장실이용하기는 소변·대변 총 횟수(기저귀 사용 시 교환 횟수)",
  ],
};

const HOME: FormSpec = {
  form: "별지 제12호 (재가, 2025.12.12판)",
  verified: "verified",
  items: {
    visit_time: "일정관리 시작·종료시간, 총시간(분)",
    support:
      "신체활동지원 6개 체크 + 제공시간(분), 인지활동지원 2줄(인지자극활동, 일상생활 함께하기, 각 분), 인지관리지원(분), 정서지원(분), 가사 및 일상생활지원 2개 체크 + 제공시간(분)",
    meal: "신체활동지원 > 식사 도움(체크), 변화상태 > 식사기능. 섭취량 칸 없음 → 특이사항",
    sleep: "특이사항",
    discomfort: "변화상태 > 신체기능, 특이사항",
    medication: "앞쪽 칸 없음 → 특이사항",
    cognition: "변화상태 > 인지기능 호전/유지/악화. detail.trend",
    notes: "특이사항 1칸(확인 사항과 조치사항)",
    next_check: "칸 없음 (기관 내부 메모)",
  },
  form_fields: {
    total_minutes: "총시간(분)",
    body_trend: "신체기능 변화상태",
    meal_trend: "식사기능 변화상태",
    cognition_trend: "인지기능 변화상태",
    stool_accidents: "대변 실수 횟수(기저귀 사용 시 교환 횟수)",
    urine_accidents: "소변 실수 횟수(기저귀 사용 시 교환 횟수)",
  },
  choices: {
    trend: ["improved", "same", "worse"],
    minutes_keys: [
      "physical",
      "cognitive_stimulation",
      "daily_living_together",
      "cognitive_management",
      "emotional",
      "housework",
    ],
  },
  rules: [
    "support의 분은 detail.minutes에 위 키 6개만, 정수(분). 말하지 않은 분은 빼거나 0",
    "지원별 제공시간 합은 방문 시간 이하",
    "호전/유지/악화는 원문에 비교가 있을 때만",
  ],
};

export function getFormSpec(careType: CareType): FormSpec {
  return careType === "home" ? HOME : FACILITY;
}
