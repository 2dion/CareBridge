// 확보한 법정 원문의 칸 좌표. 단위 pt, top은 종이 위에서부터.
// 새 서식을 그리지 않고 원문 칸에 이미 확인된 값만 넣는다.
// 아래 숫자는 첫 날짜 열 기준이고, 기간 인쇄(이슈 #261)는 dateColumns만큼 오른쪽 열로 옮겨 찍는다.
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
export type LegalFormType = keyof typeof legalForms;

// 날짜 열의 세로 경계(pt). 원문 첫 쪽의 세로선을 잰 값(PyMuPDF, 11/03). 열 k(0부터)는 [k]~[k+1] 사이다.
// 제12호는 열 간격이 같고(39.7), 제16호는 열 너비가 달라(125.3 / 119.2 / 134.7) 경계를 그대로 둔다.
// 근거: 문서/결정/2026-11-03-기간인쇄.md 6번, 이슈 #261
export const dateColumns: Record<LegalFormType, readonly number[]> = {
  "12": [261.2, 300.9, 340.6, 380.3, 419.9, 459.6, 499.3, 539.0],
  "16": [153.6, 278.9, 398.1, 532.8],
};

/** 첫 열 좌표를 k번째 열로 옮길 때 더할 x. 원문에 없는 열이면 오류 */
export function columnOffset(formType: LegalFormType, column: number): number {
  const bounds = dateColumns[formType];
  if (!Number.isInteger(column) || column < 0 || column >= bounds.length - 1)
    throw new Error(`별지 제${formType}호에는 ${column + 1}번째 날짜 열이 없습니다.`);
  return bounds[column] - bounds[0];
}

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

type FieldSink = {
  fields: PrintField[];
  add: (
    key: string,
    text: unknown,
    x: number,
    top: number,
    width: number,
    height?: number,
    flow?: boolean,
  ) => void;
};

function sink(fields: PrintField[], dx = 0, right = Infinity): FieldSink {
  return {
    fields,
    add(key, text, x, top, width, height = 11, flow = false) {
      // 좁은 열(제16호 2번째)에서는 칸 오른쪽 경계를 넘지 않게 너비를 줄인다
      const shifted = x + dx;
      const clipped = Math.min(width, right - shifted - 2);
      if (typeof text === "string" && text.trim())
        fields.push({ key, text: text.trim(), x: shifted, top, width: clipped, height, flow });
      if (typeof text === "number" && Number.isFinite(text))
        fields.push({ key, text: String(text), x: shifted, top, width: clipped, height, flow });
    },
  };
}

/** 한 장에 한 번 찍는 머리말: 수급자 성명, 기관명, 연도 */
export function headerFields(
  formType: LegalFormType,
  residentName: string,
  org: string,
  year: string,
): PrintField[] {
  const { fields, add } = sink([]);
  const name = residentName.replace(/ 어르신$/, "");
  if (formType === "16") {
    add("name", name, 108, 133, 41);
    add("org", org, 145, 153, 140, 18);
    add("year", year, 70, 251, 27);
  } else {
    add("name", name, 145, 110, 34);
    add("org", org, 150, 129, 145, 14);
    add("year", year, 110, 149, 28);
  }
  return fields;
}

export type DayFields = {
  fields: PrintField[];
  marks: PrintMark[];
  /** 제12호 특이사항 글(한 장에 하나인 가로 칸이라 날짜 열 밖). 제16호는 빈값 */
  notesText: string;
};

/**
 * 기록 1건의 날짜 열 값: 월/일, 체크, 분, 변화상태, 제16호 특이사항 영역. column(0부터)번째 열 좌표로 옮긴다.
 * 제12호 특이사항은 열 밖 가로 칸이라 글만 돌려주고(notesText), 넣는 쪽이 날짜를 붙여 잇는다.
 */
export function dayFields(record: DemoRecord, notesArea: NoteArea | "", column = 0): DayFields {
  const formType = record.formType;
  const dx = columnOffset(formType, column);
  const right = dateColumns[formType][column + 1];
  const { fields, add } = sink([], dx, right);
  const marks: PrintMark[] = [];
  const mark = (x: number, top: number) => marks.push({ x: x + dx, top });
  const value = (key: ItemKey) => printableItem(record, key)?.value_ko.trim() ?? "";
  const notes = value("notes");
  if (formType === "16" && notes && !notesArea)
    throw new Error("특이사항을 넣을 법정 양식 영역을 골라 주세요.");
  const [, month, day] = record.careDate.split("-");
  const support = printableItem(record, "support");
  const checks = Array.isArray(support?.detail?.checks) ? (support.detail.checks as string[]) : [];
  const checked = (labels: readonly string[]) =>
    checks.some((check) => typeof check === "string" && checkMatches(check, labels));
  const check = (labels: readonly string[], x: number, top: number) => {
    if (checked(labels)) mark(x, top);
  };

  if (formType === "16") {
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
    if (typeof meal?.detail?.meal_type === "string" && mealTypes[meal.detail.meal_type]) {
      const type = mealTypes[meal.detail.meal_type];
      mark(type.x, type.top);
    }
    if (typeof meal?.detail?.intake === "string" && intake[meal.detail.intake])
      mark(intake[meal.detail.intake], 344);
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
    return { fields, marks, notesText: "" };
  }

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
    mark(box.x, box.top);
    markedAreas.add(box.area);
  }
  // 가사 및 일상생활지원 분이 있는데 체크가 하나도 없으면 영역의 일반 줄('… 세탁 등')에 체크한다.
  // 신체활동지원은 일반 줄이 없어(6개 모두 특정 서비스) 분만 적고 어느 칸인지 짐작하지 않는다.
  if (minutesOf("housework") > 0 && !markedAreas.has("housework")) {
    const chores = form12Checks.find((box) => box.key === "chores")!;
    mark(chores.x, chores.top);
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
    if (typeof trend === "string" && trendX[trend.trim()]) mark(trendX[trend.trim()], top);
  }
  // 제12호 특이사항은 날짜별 작은 열이 아닌 원문의 가로 두 줄 칸을 쓴다. 넣는 쪽이 add("notes", …)로 찍는다.
  const details = [
    value("support"),
    value("meal"),
    value("sleep"),
    value("discomfort"),
    value("medication"),
    value("cognition"),
    notes,
  ];
  return { fields, marks, notesText: [...new Set(details.filter(Boolean))].join(" ") };
}

/** 제12호 특이사항 가로 칸(한 장에 하나) */
function form12Notes(fields: PrintField[], text: string) {
  sink(fields).add("notes", text, 143, 639, 391, 24, true);
}

/** 기록 1건 = 1장(첫 날짜 열). 기존 M3 [인쇄·PDF] */
export function printFields(
  record: DemoRecord,
  residentName: string,
  org: string,
  notesArea: NoteArea | "",
): { fields: PrintField[]; marks: PrintMark[] } {
  const [year] = record.careDate.split("-");
  const day = dayFields(record, notesArea, 0);
  const fields = [...headerFields(record.formType, residentName, org, year), ...day.fields];
  if (record.formType === "12") form12Notes(fields, day.notesText);
  return { fields, marks: day.marks };
}

export type PeriodDay = {
  record: DemoRecord;
  /** 시작 날짜로부터 며칠째인지(0부터). 그 날짜 열에 찍는다 */
  column: number;
  /** 제16호에서 notes를 넣을 영역(날마다 고름). 제12호는 "" */
  notesArea: NoteArea | "";
};

/**
 * 기간 인쇄(M3 · 기간 인쇄): 승인한 기록 여러 날을 한 장의 날짜 열에 모은다. 머리말은 한 번, 연도는 시작 날짜의 연도.
 * 제12호 특이사항은 가로 칸 하나에 `11/3 …`처럼 날짜를 앞에 붙여 날짜 순으로 잇는다(결정 2026-11-03-기간인쇄 7·8번).
 */
export function periodFields(
  formType: LegalFormType,
  days: PeriodDay[],
  residentName: string,
  org: string,
  from: string,
): { fields: PrintField[]; marks: PrintMark[] } {
  const [year] = from.split("-");
  const fields = headerFields(formType, residentName, org, year);
  const marks: PrintMark[] = [];
  const notes: string[] = [];
  for (const day of [...days].sort((a, b) => a.column - b.column)) {
    if (day.record.formType !== formType)
      throw new Error(`별지 제${formType}호에 다른 서식의 기록을 넣을 수 없습니다.`);
    const filled = dayFields(day.record, day.notesArea, day.column);
    fields.push(...filled.fields);
    marks.push(...filled.marks);
    if (filled.notesText) {
      const [, month, dayOfMonth] = day.record.careDate.split("-");
      notes.push(`${Number(month)}/${Number(dayOfMonth)} ${filled.notesText}`);
    }
  }
  if (formType === "12") form12Notes(fields, notes.join(" "));
  return { fields, marks };
}
