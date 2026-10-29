// 제12호 체크 칸·총시간·변화상태 (이슈 #123). 서식 칸 이름은 data/forms/form-12.json이 기준.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { createDemoDb, type DemoRecord } from "../demo/store";
import { checkMatches, form12Checks, legalForms, type PrintMark, printFields } from "./fields";
import { createRecordPdf } from "./pdf";

const db = createDemoDb("2026-10-27");
const org = db.worker.org;
const base = Object.values(db.records).find(
  (entry) => entry.formType === "12" && entry.status === "approved",
)!;
const box = (key: (typeof form12Checks)[number]["key"]) =>
  form12Checks.find((entry) => entry.key === key)!;
const marked = (marks: PrintMark[], target: { x: number; top: number }) =>
  marks.some((mark) => mark.x === target.x && mark.top === target.top);
const trendTops = { body_trend: 577, meal_trend: 590, cognition_trend: 603 } as const;

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
      alias: "이○○ 어르신",
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
