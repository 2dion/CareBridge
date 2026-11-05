import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { describe, expect, it } from "vitest";

import { createDemoDb } from "../demo/store";
import { addDays } from "../records/period-print";
import { legalForms, printFields } from "./fields";
import { createPeriodPdf, createRecordPdf, embedPrintFont, planLegalForm, wrapText } from "./pdf";

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
    expect(() => printFields(record, "김○○ 어르신", db.worker.org, [])).toThrow("영역");
    const output = printFields(record, "김○○ 어르신", db.worker.org, ["cognition"]);
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
    const output = printFields(edited, "이○○ 어르신", db.worker.org, []);
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
        notesAreas: ["physical"],
      });
      const loaded = await PDFDocument.load(pdf.bytes);
      expect(loaded.getPageCount()).toBe(pdf.recordPages + original.getPageCount() - 1);
      // 서식 쪽은 한 장. 제16호 데모 기록은 한 줄짜리 특이사항 칸을 넘쳐 이어쓰기 쪽 한 장이 더 붙는다(이슈 #317)
      expect(pdf.recordPages).toBe(formType === "16" ? 2 : 1);
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
        careDate: addDays(from, offset),
      });
      const template = readFileSync(resolve("public" + legalForms[formType].href));
      const pdf = await createPeriodPdf({
        template,
        fontBytes,
        formType,
        days: [
          { record: dated(0), column: 0, notesAreas: ["physical"] },
          { record: dated(days - 1), column: days - 1, notesAreas: ["cognition"] },
        ],
        residentName: "김○○ 어르신",
        org: db.worker.org,
        from,
        to: addDays(from, days - 1),
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

  it("제16호 기간이 3일을 넘으면 3일마다 새 서식 장을 만들고, 기록이 없는 장은 건너뛴다(#317)", async () => {
    const record = Object.values(db.records).find(
      (entry) => entry.formType === "16" && entry.status === "approved",
    )!;
    const from = "2026-10-20";
    const template = readFileSync(resolve("public" + legalForms["16"].href));
    const original = await PDFDocument.load(template);
    const make = (columns: number[]) =>
      createPeriodPdf({
        template,
        fontBytes,
        formType: "16",
        days: columns.map((column) => ({
          column,
          notesAreas: ["physical" as const],
          record: { ...record, careDate: addDays(from, column) },
        })),
        residentName: "김○○ 어르신",
        org: db.worker.org,
        from,
        to: addDays(from, Math.max(...columns)),
      });
    // 5일(0~4번째 날) → 3일 + 2일 = 서식 2장
    const five = await make([0, 1, 2, 3, 4]);
    expect(five.sheets).toBe(2);
    expect(five.recordPages).toBeGreaterThanOrEqual(2);
    const saved = await PDFDocument.load(five.bytes);
    expect(saved.getPageCount()).toBe(five.recordPages + original.getPageCount() - 1);
    // 1일째와 8일째만 있으면 가운데 장(4~6일째)은 만들지 않는다
    const gap = await make([0, 7]);
    expect(gap.sheets).toBe(2);
    // 3일 안이면 지금처럼 1장
    expect((await make([0, 2])).sheets).toBe(1);
  }, 60_000);

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

  it("제12호 7일치 긴 특이사항은 이어쓰기 쪽을 만들고 서식 뒤쪽도 남긴다(#263)", async () => {
    const record = Object.values(db.records).find(
      (entry) => entry.formType === "12" && entry.status === "approved",
    )!;
    const from = "2026-10-26";
    const template = readFileSync(resolve("public" + legalForms["12"].href));
    const original = await PDFDocument.load(template);
    const pdf = await createPeriodPdf({
      template,
      fontBytes,
      formType: "12",
      days: Array.from({ length: 7 }, (_, column) => ({
        column,
        notesAreas: [],
        record: {
          ...record,
          careDate: addDays(from, column),
          items: record.items.map((item) =>
            item.item_key === "notes"
              ? {
                  ...item,
                  status: "observed" as const,
                  resolution: null,
                  value_ko: "창가에서 쉬면서 대화를 나눔. 물을 드시도록 도움. ".repeat(15),
                }
              : item,
          ),
        },
      })),
      residentName: "가상 어르신",
      org: db.worker.org,
      from,
      to: addDays(from, 6),
      training: true,
    });
    // 서식 1장 + 이어쓰기 쪽. 서식을 줄 수만큼 복제하지 않는다(이슈 #317: 전에는 10장 넘게 나옴)
    expect(pdf.recordPages).toBeGreaterThan(1);
    expect(pdf.recordPages).toBeLessThanOrEqual(3);
    const saved = await PDFDocument.load(pdf.bytes);
    expect(saved.getPageCount()).toBe(pdf.recordPages + original.getPageCount() - 1);
    const outputDir = mkdtempSync(resolve(tmpdir(), "carebridge-period-overflow-"));
    writeFileSync(resolve(outputDir, "overflow.pdf"), pdf.bytes);
    console.info(`7일치 이어쓰기 확인: ${outputDir}/overflow.pdf`);
  }, 20_000);
});

/** 실제 뷰어가 쓰는 CID 폭 표를 읽는다. 폭이 빠졌을 때 PDF 규격 기본값은 1000이다. */
function cidWidths(font: PDFDict) {
  const descendant = font.lookup(PDFName.of("DescendantFonts"), PDFArray).lookup(0, PDFDict);
  const widths = descendant.lookup(PDFName.of("W"), PDFArray);
  const fallback = descendant.lookupMaybe(PDFName.of("DW"), PDFNumber)?.asNumber() ?? 1000;
  const map = new Map<number, number>();
  for (let index = 0; index < widths.size();) {
    const first = widths.lookup(index++, PDFNumber).asNumber();
    const next = widths.lookup(index++);
    if (next instanceof PDFArray) {
      for (let offset = 0; offset < next.size(); offset++) {
        map.set(first + offset, next.lookup(offset, PDFNumber).asNumber());
      }
    } else {
      const last = (next as PDFNumber).asNumber();
      const width = widths.lookup(index++, PDFNumber).asNumber();
      for (let cid = first; cid <= last; cid++) map.set(cid, width);
    }
  }
  return { map, fallback };
}

function unicodeMap(font: PDFDict) {
  const stream = font.lookup(PDFName.of("ToUnicode"));
  if (!(stream instanceof PDFRawStream)) throw new Error("PDF 문자 대응 스트림이 없습니다.");
  const cmap = new TextDecoder().decode(decodePDFRawStream(stream).decode());
  return new Map(
    [...cmap.matchAll(/<([\da-f]+)>\s+<([\da-f]+)>/gi)].map((match) => {
      const decoded = match[2]
        .match(/.{4}/g)!
        .map((code) => String.fromCharCode(parseInt(code, 16)))
        .join("");
      return [parseInt(match[1], 16), decoded];
    }),
  );
}

it("한글 공백 문장의 측정 폭이 저장한 PDF 폭과 같고, 공백도 원래 글로 복사된다 (#274)", async () => {
  const samples = [
    "가 나 다 라 마 바 사",
    "가  나    다",
    "식사 도움을 제공함. 창가에서 잠시 쉬심.",
    "케어브릿지 데모 요양센터",
    "합성 사례 · 공식 기록지 아님",
    "2026년 11월 3일 PDF 12 16",
  ];
  const output = await PDFDocument.create();
  const font = await embedPrintFont(output, fontBytes);
  const encoded = samples.map((text) => ({ text, ids: font.encodeText(text).asBytes() }));
  const saved = await PDFDocument.load(await output.save());
  const embedded = saved.context.lookup(font.ref, PDFDict);
  const { map, fallback } = cidWidths(embedded);
  const unicode = unicodeMap(embedded);
  for (const { text, ids } of encoded) {
    let units = 0;
    let copied = "";
    for (let index = 0; index < ids.length; index += 2) {
      const cid = ids[index] * 256 + ids[index + 1];
      // 측정한 글리프가 W·ToUnicode에서 빠지면 줄 나누기와 뷰어의 출력이 달라진다.
      expect(map.has(cid), `${text}: CID ${cid}의 폭`).toBe(true);
      expect(unicode.has(cid), `${text}: CID ${cid}의 문자 대응`).toBe(true);
      units += map.get(cid) ?? fallback;
      copied += unicode.get(cid);
    }
    for (const size of [6, 8, 16]) {
      expect((units * size) / 1000, `${text}: ${size}pt`).toBeCloseTo(
        font.widthOfTextAtSize(text, size),
        8,
      );
    }
    expect(copied).toBe(text);
    const lines = wrapText(text, 39, (line) => font.widthOfTextAtSize(line, 6));
    expect(lines.join("")).toBe(text);
    for (const line of lines) {
      const bytes = font.encodeText(line).asBytes();
      let actual = 0;
      for (let index = 0; index < bytes.length; index += 2)
        actual += ((map.get(bytes[index] * 256 + bytes[index + 1]) ?? fallback) * 6) / 1000;
      expect(actual).toBeLessThanOrEqual(39);
    }
  }
}, 20000);

// 이슈 #317: 칸을 넘친 긴 글은 서식을 복제하지 않고 이어쓰기 쪽으로 보낸다
describe("planLegalForm", () => {
  const measure = (text: string) => Array.from(text).length * 6; // 한 글자 6pt → 폭 120pt에 20자
  const field = (over: Partial<Parameters<typeof planLegalForm>[0][number]>) => ({
    key: "notes-physical",
    text: "",
    x: 0,
    top: 0,
    width: 120,
    height: 11,
    flow: true,
    label: "10/25 신체활동지원 특이사항",
    ...over,
  });

  it("칸에 들어가는 글은 그대로 두고 이어쓰기 쪽을 만들지 않는다", () => {
    const plan = planLegalForm([field({ text: "점심 죽 절반 드심" })], measure);
    expect(plan.cells[0].lines).toEqual(["점심 죽 절반 드심"]);
    expect(plan.continuation).toEqual([]);
  });

  it("넘친 글은 칸에 들어가는 줄까지만 두고 끝을 '…'로, 전체 글은 칸 이름과 함께 이어쓰기 쪽으로", () => {
    const text =
      "점심 죽 절반 정도 드심. 밤에 잘 못 주무심. 엉덩이 쪽 피부가 조금 붉어 보임. 아침 약 드심.";
    const plan = planLegalForm([field({ text })], measure);
    expect(plan.cells[0].lines).toHaveLength(1);
    expect(plan.cells[0].lines[0].endsWith("…")).toBe(true);
    expect(measure(plan.cells[0].lines[0])).toBeLessThanOrEqual(120);
    expect(text.startsWith(plan.cells[0].lines[0].slice(0, -1))).toBe(true);
    // 글자 손실 없음: 이어쓰기 쪽에 전체 글이 있다
    expect(plan.continuation).toEqual([{ label: "10/25 신체활동지원 특이사항", text }]);
  });

  it("두 줄 칸은 두 줄까지 채우고 넘친 것만 이어쓰기로 보낸다", () => {
    const plan = planLegalForm(
      [
        field({ key: "notes-cognition", height: 17, text: "가".repeat(30), label: "인지" }),
        field({ key: "notes-health", height: 13, text: "나".repeat(70), label: "건강" }),
      ],
      measure,
    );
    expect(plan.cells[0].lines).toEqual(["가".repeat(20), "가".repeat(10)]);
    expect(plan.cells[1].lines).toHaveLength(2);
    expect(plan.continuation.map((block) => block.label)).toEqual(["건강"]);
  });

  it("칸 이름이 없으면 key를 쓰고, 넘칠 수 없는 칸이 넘치면 오류", () => {
    const plan = planLegalForm([field({ label: undefined, text: "가".repeat(50) })], measure);
    expect(plan.continuation[0].label).toBe("notes-physical");
    expect(() =>
      planLegalForm([field({ key: "name", flow: false, text: "가".repeat(50) })], measure),
    ).toThrow("양식 칸보다 긴 값");
  });

  it("제16호 데모 기록의 넘친 칸은 날짜와 영역 이름이 붙는다", () => {
    const record = Object.values(db.records).find(
      (entry) => entry.formType === "16" && entry.status === "approved",
    )!;
    const { fields } = printFields(record, "김○○ 어르신", db.worker.org, ["physical"]);
    const [, month, day] = record.careDate.split("-");
    expect(fields.find((entry) => entry.key === "notes-physical")?.label).toBe(
      `${Number(month)}/${Number(day)} 신체활동지원 특이사항`,
    );
  });
});
