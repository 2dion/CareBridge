import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { createDemoDb } from "../demo/store";
import { legalForms, printFields } from "./fields";
import { createPeriodPdf, createRecordPdf, wrapText } from "./pdf";

const db = createDemoDb("2026-10-27");
const fontBytes = readFileSync(resolve("public/fonts/noto-sans-kr.ttf"));

describe("법정 원문 기록 PDF", () => {
  it("한글·긴 단어·줄바꿈은 글자 손실 없이 줄을 나눈다", () => {
    const input = "가나다라마\nabcdefghijklmnopqrstuvwxyz";
    const lines = wrapText(input, 4, (text) => [...text].length);
    expect(lines.join("")).toBe(input.replace(/\n/g, ""));
    expect(lines.every((line) => [...line].length <= 4)).toBe(true);
  });

  it("제16호 자유 특이사항 영역은 관리자가 고르며, 복약 관찰을 간호 행위로 체크하지 않는다", () => {
    const record = Object.values(db.records).find(
      (entry) => entry.formType === "16" && entry.status === "approved",
    )!;
    expect(() => printFields(record, "김○○ 어르신", db.worker.org, "")).toThrow("영역");
    const output = printFields(record, "김○○ 어르신", db.worker.org, "cognition");
    const note = record.items.find((item) => item.item_key === "notes")!;
    expect(output.fields.find((field) => field.key === "notes-cognition")?.text).toContain(
      note.value_ko,
    );
    expect(output.marks.some((mark) => mark.top === 556 || mark.top === 580)).toBe(false);
  });

  it("기록 안 함 항목은 인쇄에 넣지 않고, 미입력 분을 0으로 만들어 넣지 않는다", () => {
    const record = Object.values(db.records).find((entry) => entry.formType === "12")!;
    const edited = {
      ...record,
      items: record.items.map((item) =>
        item.item_key === "cognition"
          ? { ...item, resolution: "omitted" as const }
          : item.item_key === "notes"
            ? { ...item, value_ko: "" }
            : item,
      ),
    };
    const output = printFields(edited, "이○○ 어르신", db.worker.org, "");
    const cognition = record.items.find((item) => item.item_key === "cognition")!;
    expect(output.fields.find((field) => field.key === "notes")?.text).not.toContain(
      cognition.value_ko,
    );
    expect(
      output.fields.find((field) => field.key === "minutes-cognitive_stimulation"),
    ).toBeUndefined();
  });

  it.each(["16", "12"] as const)(
    "제%s호 원문·뒤쪽을 보존하고 값을 채우며 긴 글은 이어 쓴다",
    async (formType) => {
      const record = Object.values(db.records).find(
        (entry) => entry.formType === formType && entry.status === "approved",
      )!;
      const template = readFileSync(resolve("public" + legalForms[formType].href));
      const original = await PDFDocument.load(template);
      const pdf = await createRecordPdf({
        template,
        fontBytes,
        record,
        residentName: "김○○ 어르신",
        org: db.worker.org,
        notesArea: "physical",
      });
      const loaded = await PDFDocument.load(pdf.bytes);
      expect(loaded.getPageCount()).toBe(pdf.recordPages + original.getPageCount() - 1);
      expect(loaded.getPage(0).getSize()).toEqual(original.getPage(0).getSize());
      expect(loaded.getPage(loaded.getPageCount() - 1).getSize()).toEqual(
        original.getPage(original.getPageCount() - 1).getSize(),
      );
      const outputDir = mkdtempSync(resolve(tmpdir(), `carebridge-print-${formType}-`));
      writeFileSync(resolve(outputDir, "filled.pdf"), pdf.bytes);
      console.info(
        `법정 제${formType}호 시각 확인: ${outputDir}/filled.pdf (${pdf.recordPages} 기록쪽)`,
      );
    },
    20000,
  );

  it.each(["16", "12"] as const)(
    "제%s호 기간 인쇄: 여러 날을 한 장의 날짜 열에 찍고 마지막 열도 원문 안에 있다",
    async (formType) => {
      const record = Object.values(db.records).find(
        (entry) => entry.formType === formType && entry.status === "approved",
      )!;
      const days = legalForms[formType].days;
      const from = "2026-10-26";
      const dated = (offset: number) => ({
        ...record,
        careDate: `2026-10-${String(26 + offset).padStart(2, "0")}`,
      });
      const template = readFileSync(resolve("public" + legalForms[formType].href));
      const pdf = await createPeriodPdf({
        template,
        fontBytes,
        formType,
        days: [
          { record: dated(0), column: 0, notesArea: "physical" },
          { record: dated(days - 1), column: days - 1, notesArea: "cognition" },
        ],
        residentName: "김○○ 어르신",
        org: db.worker.org,
        from,
        to: `2026-10-${26 + days - 1}`,
        training: true,
      });
      const loaded = await PDFDocument.load(pdf.bytes);
      const original = await PDFDocument.load(template);
      expect(loaded.getPageCount()).toBe(pdf.recordPages + original.getPageCount() - 1);
      expect(loaded.getTitle()).toContain(`${from}~`);
      const outputDir = mkdtempSync(resolve(tmpdir(), `carebridge-period-${formType}-`));
      writeFileSync(resolve(outputDir, "period.pdf"), pdf.bytes);
      console.info(`법정 제${formType}호 기간 인쇄 시각 확인: ${outputDir}/period.pdf`);
    },
    20000,
  );

  it("기간 인쇄에 넣을 날이 없으면 만들지 않는다", async () => {
    await expect(
      createPeriodPdf({
        template: readFileSync(resolve("public" + legalForms["12"].href)),
        fontBytes,
        formType: "12",
        days: [],
        residentName: "",
        org: "",
        from: "2026-10-26",
        to: "2026-11-01",
      }),
    ).rejects.toThrow("승인한 기록");
  });
});
