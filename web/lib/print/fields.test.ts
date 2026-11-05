// 제12호 체크 칸·총시간·변화상태 (이슈 #123). 서식 칸 이름은 data/forms/form-12.json이 기준.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { createDemoDb, type DemoRecord } from "../demo/store";
import {
  checkMatches,
  columnOffset,
  dateColumns,
  dayFields,
  form12Checks,
  legalForms,
  mealTypeOf,
  periodFields,
  type PrintMark,
  printFields,
  toiletCountOf,
} from "./fields";
import { createRecordPdf } from "./pdf";

const db = createDemoDb("2026-10-27");
const org = db.worker.org;
const base = Object.values(db.records).find(
  (entry) => entry.formType === "12" && entry.status === "approved",
)!;

it("제12호 1건·기간 인쇄의 연도는 서식에 인쇄된 괄호 안에 있다", () => {
  const outputs = [
    printFields(base, "가상 어르신", org, ""),
    periodFields(
      "12",
      [{ record: base, column: 0, notesArea: "" }],
      "가상 어르신",
      org,
      "2026-10-27",
    ),
  ];
  // form-12-2025-12-12.pdf 첫 쪽의 괄호 글자 영역을 추출한 경계(pt).
  for (const output of outputs) {
    const year = output.fields.find((field) => field.key === "year")!;
    expect(year.x).toBeGreaterThan(117.61);
    expect(year.x + year.width).toBeLessThan(177.72);
  }
});
const box = (key: (typeof form12Checks)[number]["key"]) =>
  form12Checks.find((entry) => entry.key === key)!;
const marked = (marks: PrintMark[], target: { x: number; top: number }) =>
  marks.some((mark) => mark.x === target.x && mark.top === target.top);
const trendTops = { body_trend: 577, meal_trend: 590, cognition_trend: 603 } as const;

it.each([
  ["세면·구강청결·머리감기·몸단장·옷 갈아입기 도움 등", [212.4, 334.56, 461.64]],
  ["목욕", [174, 293.16, 418.8]],
  ["체위변경(2시간마다)", [212.4, 334.56, 461.64]],
  ["이동도움 및 신체기능유지·증진", [212.4, 334.56, 461.64]],
  ["산책", [179.52, 301.8, 428.76]],
  ["외출", [222.72, 345, 471.96]],
] as const)("제16호 %s 체크는 세 열 모두 서식 네모 안에 있다", (label, boxes) => {
  const record: DemoRecord = {
    ...base,
    formType: "16",
    items: base.items.map((item) =>
      item.item_key === "support"
        ? {
            ...item,
            status: "observed",
            resolution: null,
            detail: { checks: [label] },
          }
        : { ...item, status: "not_mentioned" },
    ),
  };
  for (let column = 0; column < 3; column++) {
    const { marks } = dayFields(record, "", column);
    expect(marks).toHaveLength(1);
    expect(marks[0].x).toBeGreaterThanOrEqual(boxes[column]);
    expect(marks[0].x + 6).toBeLessThanOrEqual(boxes[column] + 8.001);
  }
});

/** 지원 항목의 detail만 바꾼 기록. 변화상태·방문 시간 등은 patch로 덧씌운다. */
function withSupport(detail: Record<string, unknown>, patch: Partial<DemoRecord> = {}): DemoRecord {
  return {
    ...base,
    formFields: {},
    ...patch,
    items: base.items.map((item) =>
      item.item_key === "support"
        ? { ...item, status: "observed" as const, resolution: null, detail }
        : item.item_key === "cognition"
          ? { ...item, detail: {} }
          : item,
    ),
  };
}

describe("제12호 체크 칸 이름", () => {
  it("코드의 체크 칸 8개는 form-12.json의 check 칸과 key·이름이 같다", () => {
    const spec = JSON.parse(readFileSync(resolve("../data/forms/form-12.json"), "utf8")) as {
      sections: { key: string; fields: { key: string; label: string; input: string }[] }[];
    };
    const expected = spec.sections.flatMap((section) =>
      section.fields
        .filter((field) => field.input === "check")
        .map((field) => ({ area: section.key, key: field.key, label: field.label })),
    );
    expect(form12Checks.map(({ area, key, label }) => ({ area, key, label }))).toEqual(expected);
  });

  it.each([
    ["목욕", "body_wash"],
    ["몸 씻기 도움(목욕)", "body_wash"],
    ["청소", "chores"],
    ["빨래", "chores"],
    ["식사 준비", "chores"],
    ["세면·구강청결", "hygiene"],
    ["이동 도움", "mobility"],
    ["외출 동행", "personal_activity"],
  ] as const)("checks 값 '%s'은(는) %s 칸에 해당한다", (check, key) => {
    const target = box(key);
    expect(checkMatches(check, [target.label, ...target.synonyms])).toBe(true);
    for (const other of form12Checks)
      if (other.key !== key && other.area === target.area)
        expect(checkMatches(check, [other.label, ...other.synonyms])).toBe(false);
  });

  it("'식사'만 있으면 식사 도움과 식사준비 중 어느 칸인지 정하지 않는다", () => {
    for (const entry of form12Checks)
      expect(checkMatches("식사", [entry.label, ...entry.synonyms])).toBe(false);
  });
});

describe("제12호 인쇄 칸 채우기", () => {
  it("'목욕, 청소'는 몸 씻기 도움·'… 세탁 등' 칸에 체크된다", () => {
    const { marks } = printFields(
      withSupport({ checks: ["목욕", "청소", "말벗"] }),
      "이○○",
      org,
      "",
    );
    expect(marked(marks, box("body_wash"))).toBe(true);
    expect(marked(marks, box("chores"))).toBe(true);
    expect(marked(marks, box("hygiene"))).toBe(false);
    expect(marked(marks, box("meal_help"))).toBe(false);
  });

  it("가사 분이 있는데 가사 체크가 없으면 일반 줄에 체크하고, 신체활동 분만으로는 칸을 짐작하지 않는다", () => {
    const { marks, fields } = printFields(
      withSupport({ checks: [], minutes: { physical: 60, housework: 60 } }),
      "이○○",
      org,
      "",
    );
    expect(marked(marks, box("chores"))).toBe(true);
    expect(fields.find((field) => field.key === "minutes-housework")?.text).toBe("60");
    for (const entry of form12Checks)
      if (entry.area === "physical") expect(marked(marks, entry)).toBe(false);
  });

  it("가사 체크가 이미 있으면 분이 있어도 일반 줄을 더 체크하지 않는다", () => {
    const { marks } = printFields(
      withSupport({ checks: ["외출 동행"], minutes: { housework: 30 } }),
      "이○○",
      org,
      "",
    );
    expect(marked(marks, box("personal_activity"))).toBe(true);
    expect(marked(marks, box("chores"))).toBe(false);
  });

  it("가사 분이 0이거나 없으면 체크하지 않는다", () => {
    const { marks } = printFields(
      withSupport({ checks: [], minutes: { housework: 0 } }),
      "이○○",
      org,
      "",
    );
    expect(marked(marks, box("chores"))).toBe(false);
  });

  it("총시간은 방문 시작·종료로 계산하고, 없을 때만 form_fields.total_minutes를 쓴다", () => {
    const total = (record: DemoRecord) =>
      printFields(record, "이○○", org, "").fields.find((field) => field.key === "total")?.text;
    // 데모 재가 기록은 14:00~17:00. form_fields 값이 달라도 방문 시간이 기준
    expect(total(withSupport({}, { formFields: { total_minutes: 999 } }))).toBe("180");
    const noVisit = withSupport({}, { formFields: { total_minutes: 150 } });
    noVisit.items = noVisit.items.map((item) =>
      item.item_key === "visit_time" ? { ...item, detail: {} } : item,
    );
    expect(total(noVisit)).toBe("150");
    expect(total({ ...noVisit, formFields: {} })).toBeUndefined();
  });

  it("변화상태는 form_fields의 *_trend 값으로 체크하고, 없으면 비운다", () => {
    const trendX = { improved: 267, same: 277, worse: 287 };
    const filled = printFields(
      withSupport(
        {},
        { formFields: { body_trend: "improved", meal_trend: "유지", cognition_trend: "worse" } },
      ),
      "이○○",
      org,
      "",
    ).marks;
    expect(marked(filled, { x: trendX.improved, top: trendTops.body_trend })).toBe(true);
    expect(marked(filled, { x: trendX.same, top: trendTops.meal_trend })).toBe(true);
    expect(marked(filled, { x: trendX.worse, top: trendTops.cognition_trend })).toBe(true);

    const empty = printFields(withSupport({}, { formFields: {} }), "이○○", org, "").marks;
    const invalid = printFields(
      withSupport({}, { formFields: { body_trend: "better", meal_trend: 1 as never } }),
      "이○○",
      org,
      "",
    ).marks;
    for (const top of Object.values(trendTops)) {
      expect(empty.some((mark) => mark.top === top)).toBe(false);
      expect(invalid.some((mark) => mark.top === top)).toBe(false);
    }
  });

  it("인지 변화 detail.trend는 form_fields.cognition_trend가 없을 때 쓴다", () => {
    const record = withSupport({});
    record.items = record.items.map((item) =>
      item.item_key === "cognition" ? { ...item, detail: { trend: "same" } } : item,
    );
    const { marks } = printFields(record, "이○○", org, "");
    expect(marked(marks, { x: 277, top: trendTops.cognition_trend })).toBe(true);
  });

  it("동의어 체크·변화상태가 든 기록으로 법정 원문 PDF를 만들고, 표시 좌표가 모두 첫 쪽 안에 있다", async () => {
    const record = withSupport(
      { checks: ["목욕", "청소"], minutes: { physical: 60, housework: 60, emotional: 60 } },
      { formFields: { body_trend: "same", stool_accidents: 1 } },
    );
    const { marks, fields } = printFields(record, "이○○", org, "");
    const template = readFileSync(resolve("public" + legalForms["12"].href));
    const pdf = await createRecordPdf({
      template,
      fontBytes: readFileSync(resolve("public/fonts/noto-sans-kr.ttf")),
      record,
      residentName: "이○○ 어르신",
      org,
      notesArea: "",
    });
    const loaded = await PDFDocument.load(pdf.bytes);
    const { width, height } = loaded.getPage(0).getSize();
    expect(pdf.recordPages).toBe(1);
    for (const mark of marks) {
      expect(mark.x).toBeGreaterThan(0);
      expect(mark.x + 6).toBeLessThan(width);
      expect(mark.top).toBeGreaterThan(0);
      expect(mark.top + 5).toBeLessThan(height);
    }
    for (const field of fields) expect(field.x + field.width).toBeLessThanOrEqual(width);
    expect(marks.filter((mark) => mark.top === box("body_wash").top)).toHaveLength(1);
  }, 20000);
});

// 기간 인쇄(이슈 #261): k번째 날짜 열로 옮긴 좌표가 그 열의 세로 경계 안에 있는지
describe("날짜 열 좌표(기간 인쇄)", () => {
  const facility = Object.values(db.records).find(
    (entry) => entry.formType === "16" && entry.status === "approved",
  )!;
  const home = withSupport(
    { checks: ["목욕", "청소"], minutes: { physical: 60, housework: 60, emotional: 60 } },
    { formFields: { body_trend: "same", stool_accidents: 1, urine_accidents: 2 } },
  );

  it("제12호는 열 7개, 제16호는 열 3개이고 그 밖의 열은 오류", () => {
    expect(columnOffset("12", 0)).toBe(0);
    expect(columnOffset("12", 6)).toBeCloseTo(238.1, 5);
    expect(columnOffset("16", 2)).toBeCloseTo(244.5, 5);
    expect(() => columnOffset("12", 7)).toThrow("8번째");
    expect(() => columnOffset("16", 3)).toThrow("4번째");
    expect(() => columnOffset("16", -1)).toThrow();
  });

  it.each([0, 3, 6])("제12호 %i번째 열의 글·체크가 모두 그 열 안에 찍힌다", (column) => {
    const [left, right] = [dateColumns["12"][column], dateColumns["12"][column + 1]];
    const { fields, marks } = dayFields(home, "", column);
    expect(fields.length).toBeGreaterThan(5);
    expect(marks.length).toBeGreaterThan(2);
    for (const field of fields) {
      expect(field.x, field.key).toBeGreaterThanOrEqual(left);
      expect(field.x + field.width, field.key).toBeLessThanOrEqual(right);
    }
    for (const mark of marks) {
      expect(mark.x).toBeGreaterThanOrEqual(left);
      expect(mark.x + 6).toBeLessThanOrEqual(right);
    }
    expect(fields.find((field) => field.key === "day")?.text).toBe(
      String(Number(home.careDate.slice(8))),
    );
  });

  it.each([0, 1, 2])("제16호 %i번째 열의 글·체크가 모두 그 열 안에 찍힌다", (column) => {
    const [left, right] = [dateColumns["16"][column], dateColumns["16"][column + 1]];
    const { fields, marks } = dayFields(facility, "physical", column);
    expect(fields.some((field) => field.key.startsWith("notes-"))).toBe(true);
    for (const field of fields) {
      expect(field.x, field.key).toBeGreaterThanOrEqual(left);
      expect(field.x + field.width, field.key).toBeLessThanOrEqual(right);
      expect(field.width, field.key).toBeGreaterThan(30);
    }
    for (const mark of marks) {
      expect(mark.x).toBeGreaterThanOrEqual(left);
      expect(mark.x + 6).toBeLessThanOrEqual(right);
    }
  });

  it("기간 인쇄는 머리말을 한 번만, 제12호 특이사항은 날짜를 붙여 잇는다", () => {
    const day1 = { ...home, careDate: "2026-10-27" };
    const day3 = { ...home, careDate: "2026-10-29" };
    const { fields } = periodFields(
      "12",
      [
        { record: day3, column: 2, notesArea: "" },
        { record: day1, column: 0, notesArea: "" },
      ],
      "이○○ 어르신",
      org,
      "2026-10-27",
    );
    expect(fields.filter((field) => field.key === "name")).toHaveLength(1);
    expect(fields.find((field) => field.key === "year")?.text).toBe("2026");
    expect(fields.filter((field) => field.key === "day").map((field) => field.text)).toEqual([
      "27",
      "29",
    ]);
    const notes = fields.find((field) => field.key === "notes")!;
    expect(notes.text.startsWith("10/27 ")).toBe(true);
    expect(notes.text).toContain(" 10/29 ");
    expect(notes.text.indexOf("10/27")).toBeLessThan(notes.text.indexOf("10/29"));
    expect(fields.filter((field) => field.key === "notes")).toHaveLength(1);
    expect(() =>
      periodFields("16", [{ record: day1, column: 0, notesArea: "" }], "이○○", org, "2026-10-27"),
    ).toThrow("다른 서식");
  });

  it("제16호 기간 인쇄는 notes가 있는 날마다 영역을 골라야 한다", () => {
    expect(() =>
      periodFields(
        "16",
        [{ record: facility, column: 1, notesArea: "" }],
        "김○○",
        org,
        "2026-10-26",
      ),
    ).toThrow("영역");
  });
});

// 이슈 #317: 실제 AI 기록 모양(짧은 체크 이름, 글에만 있는 종류·횟수)도 서식 세부 칸을 채운다
describe("제16호 세부 항목 채우기", () => {
  const facility = Object.values(db.records).find(
    (entry) => entry.formType === "16" && entry.status === "approved",
  )!;
  const withItems = (
    patch: Partial<Record<string, { value_ko?: string; detail?: Record<string, unknown> }>>,
  ): DemoRecord => ({
    ...facility,
    items: facility.items.map((item) =>
      patch[item.item_key]
        ? { ...item, status: "observed" as const, resolution: null, ...patch[item.item_key] }
        : item,
    ),
  });
  const has = (marks: PrintMark[], x: number, top: number) =>
    marks.some((mark) => Math.abs(mark.x - x) < 0.01 && mark.top === top);

  it("서식 기준의 짧은 체크 이름(세면 등·체위변경·이동·산책/외출)도 그 칸에 체크한다", () => {
    const record = withItems({
      support: {
        value_ko: "세면 보조, 체위변경, 화장실 이동 도움, 산책 동행",
        detail: { checks: ["세면 등", "체위변경", "화장실", "이동", "산책/외출"] },
      },
    });
    const { marks } = dayFields(record, "physical", 0);
    expect(has(marks, 214, 281)).toBe(true); // 세면·구강청결…
    expect(has(marks, 214, 362)).toBe(true); // 체위변경(2시간마다)
    expect(has(marks, 214, 409)).toBe(true); // 이동도움
    expect(has(marks, 181, 427)).toBe(true); // 산책
    expect(has(marks, 224, 427)).toBe(true); // 외출
    expect(has(marks, 176, 305)).toBe(false); // 목욕은 말하지 않음
  });

  it("식사 종류: 저장 칸이 있으면 그 값, 없으면 승인한 글에 하나로 적혀 있을 때만", () => {
    const meal = (value_ko: string, detail: Record<string, unknown> = {}) =>
      withItems({ meal: { value_ko, detail } });
    expect(mealTypeOf(meal("점심 드심", { meal_type: "죽" }))).toBe("죽");
    expect(mealTypeOf(meal("점심: 죽, 조금 드심"))).toBe("죽");
    expect(mealTypeOf(meal("일반식, 전량 섭취"))).toBe("일반식");
    expect(mealTypeOf(meal("튜브로 영양 공급함"))).toBe("유동식(튜브영양공급식)");
    expect(mealTypeOf(meal("죽 대신 일반식 드심"))).toBeNull();
    expect(mealTypeOf(meal("밥 두 그릇 드심"))).toBeNull();
    expect(mealTypeOf(meal("점심 드심", { meal_type: "특식" }))).toBeNull();
    expect(has(dayFields(meal("점심: 죽, 조금 드심"), "physical", 0).marks, 195, 317)).toBe(true);
  });

  it("화장실이용하기 횟수: 저장 칸이 있으면 그 값, 없으면 글에 횟수가 하나일 때만", () => {
    const support = (value_ko: string, detail: Record<string, unknown> = {}) =>
      withItems({ support: { value_ko, detail } });
    expect(toiletCountOf(support("기저귀 교환", { toilet_count: 4 }))).toBe(4);
    expect(
      toiletCountOf(support("세면 보조, 옷 갈아입히기, 체위변경(2시간마다), 기저귀 교환 3회")),
    ).toBe(3);
    expect(toiletCountOf(support("화장실 5번 다녀오심"))).toBe(5);
    expect(toiletCountOf(support("소변 주머니 2~3회 비움"))).toBeUndefined();
    expect(toiletCountOf(support("기저귀 교환 3회, 화장실 2회"))).toBeUndefined();
    expect(toiletCountOf(support("체위변경 2회 실시"))).toBeUndefined();
    const fields = dayFields(support("기저귀 교환 3회"), "physical", 0).fields;
    expect(fields.find((field) => field.key === "toilet")?.text).toBe("3");
  });

  it("제12호 화장실이용하기는 '기저귀 교환'도 체크한다", () => {
    const toilet = form12Checks.find((box) => box.key === "toilet")!;
    expect(checkMatches("기저귀 교환", [toilet.label, ...toilet.synonyms])).toBe(true);
  });
});
