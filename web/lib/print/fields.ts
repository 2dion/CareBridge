// 확보한 법정 원문 첫 날짜 열의 좌표. 단위 pt, top은 종이 위에서부터.
// 새 서식을 그리지 않고 원문 칸에 이미 확인된 값만 넣는다.
import type { ItemKey } from "../demo/state";
import { type DemoRecord, visitMinutes } from "../demo/store";

export const noteAreas = [
  { key: "physical", label: "신체활동지원" },
  { key: "cognition", label: "인지관리 및 의사소통" },
  { key: "health", label: "건강 및 간호관리" },
  { key: "rehab", label: "기능회복훈련" },
] as const;
export type NoteArea = (typeof noteAreas)[number]["key"];
export type PrintField = {
  key: string;
  text: string;
  x: number;
  top: number;
  width: number;
  height: number;
  flow?: boolean;
};
export type PrintMark = { x: number; top: number };

export const legalForms = {
  "16": { href: "/forms/form-16-2019-09-27.pdf", revised: "2019. 9. 27.", days: 3 },
  "12": { href: "/forms/form-12-2025-12-12.pdf", revised: "2025. 12. 12.", days: 7 },
} as const;

// 제12호 체크 칸 8개. key·label은 data/forms/form-12.json의 input "check" 칸과 같다.
// synonyms: 작성자·AI가 detail.checks에 쓰는 짧은 말(목욕, 청소 등). 칸 이름과 글자가 달라도 체크한다.
// 근거: 이슈 #123(목욕 → 몸 씻기 도움, 청소·빨래 → 식사준비, 청소 및 주변정리 정돈, 세탁 등)
export const form12Checks = [
  {
    key: "hygiene",
    area: "physical",
    label: "개인위생(옷갈아입기, 세면, 구강청결, 몸단장 도움 등)",
    synonyms: ["개인위생", "세면", "구강청결", "몸단장", "옷갈아입기", "머리감기"],
    x: 278,
    top: 276,
  },
  {
    key: "body_wash",
    area: "physical",
    label: "몸 씻기 도움",
    synonyms: ["목욕", "몸씻기"],
    x: 278,
    top: 298,
  },
  {
    key: "meal_help",
    area: "physical",
    label: "식사 도움(영양관리 등)",
    synonyms: ["식사도움", "영양관리"],
    x: 278,
    top: 320,
  },
  { key: "reposition", area: "physical", label: "체위변경", synonyms: ["체위"], x: 278, top: 342 },
  {
    key: "mobility",
    area: "physical",
    label: "이동 도움(보행, 보장구사용 등 도움)",
    synonyms: ["이동도움", "보행", "보장구"],
    x: 278,
    top: 364,
  },
  {
    key: "toilet",
    area: "physical",
    label: "화장실이용하기",
    synonyms: ["화장실"],
    x: 278,
    top: 386,
  },
  {
    key: "chores",
    area: "housework",
    label: "식사준비, 청소 및 주변정리 정돈, 세탁 등",
    synonyms: ["식사준비", "청소", "주변정리", "정리정돈", "세탁", "빨래", "가사"],
    x: 278,
    top: 512,
  },
  {
    key: "personal_activity",
    area: "housework",
    label: "개인활동지원(외출시 동행 등)",
    synonyms: ["개인활동", "외출", "동행"],
    x: 278,
    top: 540,
  },
] as const;

// 띄어쓰기·문장부호 차이로 체크를 놓치지 않도록 글자와 숫자만 남긴다.
const normalized = (text: string) => text.normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "");

/** checks 값 하나가 칸 이름(또는 동의어)에 해당하는지. 정리한 뒤 '포함'으로 본다. */
export function checkMatches(check: string, labels: readonly string[]): boolean {
  const text = normalized(check);
  if (!text) return false;
  return labels.some((label) => {
    const needle = normalized(label);
    return needle !== "" && text.includes(needle);
  });
}

export function printableItem(record: DemoRecord, key: ItemKey) {
  const item = record.items.find((entry) => entry.item_key === key);
  return item && item.resolution !== "omitted" && item.status !== "not_mentioned"
    ? item
    : undefined;
}

export function printFields(
  record: DemoRecord,
  alias: string,
  org: string,
  notesArea: NoteArea | "",
): { fields: PrintField[]; marks: PrintMark[] } {
  const fields: PrintField[] = [];
  const marks: PrintMark[] = [];
  const add = (
    key: string,
    text: unknown,
    x: number,
    top: number,
    width: number,
    height = 11,
    flow = false,
  ) => {
    if (typeof text === "string" && text.trim())
      fields.push({ key, text: text.trim(), x, top, width, height, flow });
    if (typeof text === "number" && Number.isFinite(text))
      fields.push({ key, text: String(text), x, top, width, height, flow });
  };
  const value = (key: ItemKey) => printableItem(record, key)?.value_ko.trim() ?? "";
  const notes = value("notes");
  if (record.formType === "16" && notes && !notesArea)
    throw new Error("특이사항을 넣을 법정 양식 영역을 골라 주세요.");
  const [year, month, day] = record.careDate.split("-");
  const support = printableItem(record, "support");
  const checks = Array.isArray(support?.detail?.checks) ? (support.detail.checks as string[]) : [];
  const checked = (labels: readonly string[]) =>
    checks.some((check) => typeof check === "string" && checkMatches(check, labels));
  const check = (labels: readonly string[], x: number, top: number) => {
    if (checked(labels)) marks.push({ x, top });
  };

  if (record.formType === "16") {
    add("name", alias.replace(/ 어르신$/, ""), 108, 133, 41);
    add("org", org, 145, 153, 140, 18);
    add("year", year, 70, 251, 27);
    add("date", `${Number(month)}/${Number(day)}`, 208, 251, 40);
    check(
      [
        "세면·구강청결·머리감기·몸단장·옷 갈아입기 도움 등",
        "세면, 구강청결, 머리감기, 몸단장, 옷 갈아입기 도움 등",
      ],
      214,
      281,
    );
    check(["목욕", "몸 씻기 도움"], 176, 305);
    check(["체위변경(2시간마다)"], 214, 362);
    check(["이동도움 및 신체기능유지·증진"], 214, 409);
    check(["산책"], 181, 427);
    check(["외출"], 224, 427);
    check(["인지관리 지원"], 214, 466);
    check(["의사소통도움 등 말벗, 격려"], 214, 486);
    add("toilet", support?.detail?.toilet_count, 195, 383, 23);
    const meal = printableItem(record, "meal");
    const mealTypes: Record<string, PrintMark> = {
      일반식: { x: 156, top: 317 },
      죽: { x: 195, top: 317 },
      "유동식(튜브영양공급식)": { x: 156, top: 331 },
    };
    const intake: Record<string, number> = { full: 162, half_or_more: 184, under_half: 231 };
    if (typeof meal?.detail?.meal_type === "string" && mealTypes[meal.detail.meal_type])
      marks.push(mealTypes[meal.detail.meal_type]);
    if (typeof meal?.detail?.intake === "string" && intake[meal.detail.intake])
      marks.push({ x: intake[meal.detail.intake], top: 344 });
    const areaValues: Record<NoteArea, string[]> = {
      physical: [value("sleep"), value("discomfort"), value("medication")],
      cognition: [value("cognition")],
      health: [],
      rehab: [],
    };
    // 식사 자유 서술도 빠뜨리지 않는다. 복약 관찰을 간호 행위 체크로 바꾸지 않는다.
    if (value("meal")) areaValues.physical.unshift(value("meal"));
    if (notes && notesArea) areaValues[notesArea].push(notes);
    const tops: Record<NoteArea, { top: number; height: number }> = {
      physical: { top: 435.5, height: 11 },
      cognition: { top: 501.5, height: 17 },
      health: { top: 611.5, height: 13 },
      rehab: { top: 718, height: 14 },
    };
    for (const { key } of noteAreas) {
      const text = [...new Set(areaValues[key].filter(Boolean))].join(" ");
      add(`notes-${key}`, text, 156, tops[key].top, 120, tops[key].height, true);
    }
    add("stay", value("visit_time"), 156, 748, 120, 34, true);
  } else {
    add("name", alias.replace(/ 어르신$/, ""), 145, 110, 34);
    add("org", org, 150, 129, 145, 14);
    add("year", year, 110, 149, 28);
    add("month", String(Number(month)), 267, 149, 11);
    add("day", String(Number(day)), 284, 149, 12);
    const time = printableItem(record, "visit_time")?.detail;
    const extra = record.formFields as Record<string, unknown> | undefined;
    // 총시간은 방문 시작·종료(records.visit_start·visit_end)로 계산하고, 시간이 없을 때만 form_fields.total_minutes를 쓴다.
    const storedTotal = extra?.total_minutes;
    const minutes =
      visitMinutes(record) ??
      (typeof storedTotal === "number" && Number.isFinite(storedTotal) && storedTotal > 0
        ? storedTotal
        : undefined);
    add("total", minutes, 269, 165, 17);
    for (const [key, top] of [
      ["start", 181],
      ["end", 197],
    ] as const) {
      const timeValue = time?.[key];
      if (typeof timeValue === "string" && /^\d{1,2}:\d{2}$/.test(timeValue)) {
        const [hour, minute] = timeValue.split(":");
        add(`${key}-hour`, hour, 267, top, 11);
        add(`${key}-minute`, minute, 284, top, 12);
      }
    }
    const times = support?.detail?.minutes as Record<string, unknown> | undefined;
    const minutesOf = (key: string) => {
      const value = times?.[key];
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
    };
    const markedAreas = new Set<string>();
    for (const box of form12Checks) {
      if (!checked([box.label, ...box.synonyms])) continue;
      marks.push({ x: box.x, top: box.top });
      markedAreas.add(box.area);
    }
    // 가사 및 일상생활지원 분이 있는데 체크가 하나도 없으면 영역의 일반 줄('… 세탁 등')에 체크한다.
    // 신체활동지원은 일반 줄이 없어(6개 모두 특정 서비스) 분만 적고 어느 칸인지 짐작하지 않는다.
    if (minutesOf("housework") > 0 && !markedAreas.has("housework")) {
      const chores = form12Checks.find((box) => box.key === "chores")!;
      marks.push({ x: chores.x, top: chores.top });
    }
    const timeTops = {
      physical: 400,
      cognitive_stimulation: 416,
      daily_living_together: 432,
      cognitive_management: 453,
      emotional: 481,
      housework: 560,
    };
    for (const [key, top] of Object.entries(timeTops))
      add(`minutes-${key}`, times?.[key], 269, top, 18);
    add("stool", extra?.stool_accidents, 272, 614, 20);
    add("urine", extra?.urine_accidents, 272, 627, 20);
    // 변화상태(①호전 ②유지 ③악화). form_fields의 영어 값이 기준이고, 서식 한국어 값도 받는다.
    // 값이 없거나 셋 밖이면 비운다(AI 규칙 원칙 2: 지어내지 않음).
    const trendX: Record<string, number> = {
      improved: 267,
      호전: 267,
      same: 277,
      유지: 277,
      worse: 287,
      악화: 287,
    };
    for (const [key, top] of [
      ["body_trend", 577],
      ["meal_trend", 590],
      ["cognition_trend", 603],
    ] as const) {
      const trend =
        extra?.[key] ??
        (key === "cognition_trend" ? printableItem(record, "cognition")?.detail?.trend : undefined);
      if (typeof trend === "string" && trendX[trend.trim()])
        marks.push({ x: trendX[trend.trim()], top });
    }
    // 제12호 특이사항은 날짜별 작은 열이 아닌 원문의 가로 두 줄 칸을 쓴다.
    const details = [
      value("support"),
      value("meal"),
      value("sleep"),
      value("discomfort"),
      value("medication"),
      value("cognition"),
      notes,
    ];
    add("notes", [...new Set(details.filter(Boolean))].join(" "), 143, 639, 391, 24, true);
  }
  return { fields, marks };
}
