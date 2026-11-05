import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

import type { DemoRecord } from "../demo/store";
import { addDays } from "../records/period-print";
import {
  legalForms,
  type LegalFormType,
  type NoteArea,
  type PeriodDay,
  periodFields,
  type PrintField,
  type PrintMark,
  printFields,
} from "./fields";

/** 한글도 글자 단위로 측정해 줄을 나누며, 넘치는 내용을 자르지 않는다. */
export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && measure(line + char) > width) {
        lines.push(line);
        line = char;
      } else line += char;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Noto Sans KR의 calt는 한글 사이 공백을 Unicode cmap에 없는 대체 글리프로 바꾼다.
 * pdf-lib의 전체 포함 폭 표(W)에는 그 글리프가 없어 뷰어가 기본 폭을 쓰고 줄이 넘친다(#274).
 * 문맥 치환만 끄고 기본 공백을 써서 측정 폭·PDF 폭·복사한 글을 일치시킨다.
 */
export async function embedPrintFont(output: PDFDocument, fontBytes: Uint8Array): Promise<PDFFont> {
  output.registerFontkit(fontkit);
  // 고정 TrueType 전체 포함은 유지해 CJK 부분 포함의 뷰어별 누락을 피한다.
  return output.embedFont(fontBytes, { subset: false, features: { calt: false } });
}

/** 서식 한 장 분량: 칸·체크와, 이어쓰기 쪽에 적을 설명(어느 기록·기간인지) */
type FormSheet = { fields: PrintField[]; marks: PrintMark[]; caption: string };

type RenderInput = {
  template: Uint8Array;
  fontBytes: Uint8Array;
  /** 서식 장 목록. 기록 1건 인쇄는 1장, 기간 인쇄는 날짜 열 수(제12호 7일, 제16호 3일)마다 1장 */
  sheets: FormSheet[];
  /** 쪽마다 위에 찍는 붉은 표시 글(쪽 번호 앞부분). 예: '합성 사례 · 공식 기록지 아님' */
  stamp: string;
  title: string;
};

const FORM_FONT_SIZE = 6;
const FORM_LINE_HEIGHT = 6.5;
const ELLIPSIS = "…";
// 이어쓰기 쪽(서식 칸을 넘친 글을 모아 찍는 쪽)의 글자 크기·줄 간격·여백(pt)
const CONT_MARGIN = 54;
const CONT_SIZE = 9;
const CONT_LINE_HEIGHT = 13;

export type FormPlan = {
  /** 서식 쪽에 찍을 칸. 넘친 칸은 들어가는 줄까지만 두고 마지막 줄 끝을 '…'로 바꾼다 */
  cells: (PrintField & { lines: string[] })[];
  /** 칸을 넘친 글 전체(칸 이름과 함께). 서식을 복제하지 않고 이어쓰기 쪽에 모아 찍는다(이슈 #317) */
  continuation: { label: string; text: string }[];
};

/**
 * 칸마다 줄을 나누고, 긴 글(flow)이 칸을 넘치면 들어가는 줄까지만 서식에 두고 전체 글을 이어쓰기 쪽으로 보낸다.
 * 글자는 버리지 않는다: 서식에서 줄인 글은 이어쓰기 쪽에 전체가 있다. 넘칠 수 없는 칸(flow 아님)이 넘치면 오류다.
 * 근거: 문서/결정/2026-11-05-인쇄이어쓰기쪽.md
 */
export function planLegalForm(fields: PrintField[], measure: (text: string) => number): FormPlan {
  const cells: FormPlan["cells"] = [];
  const continuation: FormPlan["continuation"] = [];
  for (const field of fields) {
    const lines = wrapText(field.text, field.width, measure);
    const capacity = Math.max(1, Math.floor(field.height / FORM_LINE_HEIGHT));
    if (lines.length <= capacity) {
      cells.push({ ...field, lines });
      continue;
    }
    if (!field.flow)
      throw new Error(`${field.key}: 양식 칸보다 긴 값입니다. 원래 기록을 확인해 주세요.`);
    const visible = lines.slice(0, capacity);
    const last = Array.from(visible[capacity - 1]);
    while (last.length > 0 && measure(last.join("") + ELLIPSIS) > field.width) last.pop();
    visible[capacity - 1] = last.join("") + ELLIPSIS;
    cells.push({ ...field, lines: visible });
    continuation.push({ label: field.label ?? field.key, text: field.text });
  }
  return { cells, continuation };
}

/**
 * 법정 원문 첫 쪽을 서식 장마다 복제해 칸을 채운다. 서식 한 장에는 그 장의 날짜 열만 들어가고,
 * 날짜 열 수를 넘는 기간은 새 서식 장으로 넘긴다(결정 2026-11-05-기간인쇄여러장).
 * 긴 글(flow)이 칸을 넘치면 서식을 복제하지 않고, 그 장 바로 뒤에 '이어쓰기' 쪽을 붙여 칸 이름과 함께 전체 글을 찍는다(이슈 #317).
 * 뒤쪽 유의사항은 맨 끝에 한 번만 원문 그대로 붙인다. 기록 1건 인쇄와 기간 인쇄가 같은 방법으로 찍는다.
 */
async function renderLegalForm({ template, fontBytes, sheets, stamp, title }: RenderInput) {
  const source = await PDFDocument.load(template);
  const output = await PDFDocument.create();
  const font = await embedPrintFont(output, fontBytes);
  const { width, height } = source.getPage(0).getSize();
  const firstRowY = height - 100;

  // 장마다 서식 칸과 이어쓰기 쪽 배치를 먼저 정해 전체 쪽 수를 안다
  const layouts = sheets.map((sheet) => {
    const plan = planLegalForm(sheet.fields, (text) =>
      font.widthOfTextAtSize(text, FORM_FONT_SIZE),
    );
    // 이어쓰기 쪽: 칸 이름 한 줄 + 전체 글. 한 쪽에 다 안 들어가면 쪽을 더한다
    const rows: { text: string; gap: number }[] = [];
    for (const block of plan.continuation) {
      rows.push({ text: `[${block.label}]`, gap: rows.length > 0 ? CONT_LINE_HEIGHT / 2 : 0 });
      const lines = wrapText(block.text, width - CONT_MARGIN * 2, (text) =>
        font.widthOfTextAtSize(text, CONT_SIZE),
      );
      for (const text of lines) rows.push({ text, gap: 0 });
    }
    const continuationPages: { text: string; y: number }[][] = [];
    let cursor = firstRowY;
    for (const row of rows) {
      const current = continuationPages[continuationPages.length - 1];
      if (!current || cursor - row.gap < CONT_MARGIN) {
        continuationPages.push([{ text: row.text, y: firstRowY }]);
        cursor = firstRowY - CONT_LINE_HEIGHT;
      } else {
        current.push({ text: row.text, y: cursor - row.gap });
        cursor -= row.gap + CONT_LINE_HEIGHT;
      }
    }
    return { sheet, plan, continuationPages };
  });

  const pagesNeeded = layouts.reduce((sum, layout) => sum + 1 + layout.continuationPages.length, 0);
  let pageIndex = 0;
  const drawStamp = (page: PDFPage, continued: boolean) => {
    page.drawText(`${stamp} · ${pageIndex + 1}/${pagesNeeded}${continued ? " 이어쓰기" : ""}`, {
      x: 54,
      y: height - 32,
      size: 8,
      font,
      color: rgb(0.65, 0.12, 0.12),
    });
    pageIndex += 1;
  };

  for (const { sheet, plan, continuationPages } of layouts) {
    const [formPage] = await output.copyPages(source, [0]);
    output.addPage(formPage);
    for (const cell of plan.cells) {
      cell.lines.forEach((text, line) =>
        formPage.drawText(text, {
          x: cell.x,
          y: height - cell.top - FORM_FONT_SIZE - line * FORM_LINE_HEIGHT,
          size: FORM_FONT_SIZE,
          font,
          color: rgb(0, 0, 0),
        }),
      );
    }
    // 체크는 원문 체크 칸 안에 선 두 개로만 표시. 등록되지 않은 값은 추정하지 않는다.
    for (const mark of sheet.marks) {
      const y = height - mark.top;
      formPage.drawLine({
        start: { x: mark.x, y: y - 3 },
        end: { x: mark.x + 2, y: y - 5 },
        thickness: 0.8,
      });
      formPage.drawLine({
        start: { x: mark.x + 2, y: y - 5 },
        end: { x: mark.x + 6, y: y + 1 },
        thickness: 0.8,
      });
    }
    // 실제 서명·생년월일·인정번호 등 없는 정보는 비워 둔다. 승인자를 종사자 서명으로 쓰지 않는다.
    drawStamp(formPage, false);

    for (const pageRows of continuationPages) {
      const page = output.addPage([width, height]);
      drawStamp(page, true);
      page.drawText("특이사항 이어쓰기", {
        x: CONT_MARGIN,
        y: height - 62,
        size: 11,
        font,
        color: rgb(0, 0, 0),
      });
      page.drawText(`서식 칸에 다 들어가지 않은 글의 전체입니다 · ${sheet.caption}`, {
        x: CONT_MARGIN,
        y: height - 78,
        size: 8,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });
      for (const row of pageRows) {
        page.drawText(row.text, {
          x: CONT_MARGIN,
          y: row.y,
          size: CONT_SIZE,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  if (source.getPageCount() > 1) {
    const instructions = await output.copyPages(source, source.getPageIndices().slice(1));
    instructions.forEach((page) => output.addPage(page));
  }
  output.setTitle(title);
  return {
    bytes: await output.save(),
    /** 서식 장 수 */
    sheets: layouts.length,
    /** 서식 장 + 이어쓰기 쪽 */
    recordPages: pagesNeeded,
    totalPages: output.getPageCount(),
  };
}

/** 교육용 기관의 연습 기록이면 '연습용'을 찍는다(결정 2026-10-25-강사흐름통일 4, 이슈 #125) */
const stampOf = (training: boolean, extra = "") =>
  `${training ? "연습용 · " : ""}합성 사례 · 공식 기록지 아님${extra}`;

/** 기록 1건 = 1장(첫 날짜 열). M3 [인쇄·PDF] */
export async function createRecordPdf({
  template,
  fontBytes,
  record,
  residentName,
  org,
  notesAreas,
  training = false,
}: {
  template: Uint8Array;
  fontBytes: Uint8Array;
  record: DemoRecord;
  residentName: string;
  org: string;
  notesAreas: NoteArea[];
  training?: boolean;
}) {
  const { fields, marks } = printFields(record, residentName, org, notesAreas);
  const title = `합성 사례 ${record.careDate} 별지 제${record.formType}호`;
  return renderLegalForm({
    template,
    fontBytes,
    sheets: [{ fields, marks, caption: title }],
    stamp: stampOf(training, record.status === "approved" ? "" : " · 승인 전"),
    title,
  });
}

/**
 * 기간 인쇄(M3 · 기간 인쇄): 승인한 기록 여러 날을 서식의 날짜 열에 모아 찍는다(결정 2026-11-03-기간인쇄, 이슈 #261).
 * days의 column은 시작 날짜로부터 며칠째인지(0부터). 한 장의 날짜 수를 넘으면 다음 서식 장의 열로 간다.
 * 승인한 기록만 넣으므로 '승인 전' 표시는 쓰지 않는다.
 */
export async function createPeriodPdf({
  template,
  fontBytes,
  formType,
  days,
  residentName,
  org,
  from,
  to,
  training = false,
}: {
  template: Uint8Array;
  fontBytes: Uint8Array;
  formType: LegalFormType;
  days: PeriodDay[];
  residentName: string;
  org: string;
  from: string;
  to: string;
  training?: boolean;
}) {
  if (days.length === 0) throw new Error("이 기간에는 승인한 기록이 없어요.");
  // 서식 한 장의 날짜 열 수(제12호 7일, 제16호 3일)를 넘는 날은 새 서식 장으로 넘긴다.
  // 승인한 기록이 하나도 없는 장은 만들지 않는다(결정 2026-11-05-기간인쇄여러장, 이슈 #317)
  const perSheet = legalForms[formType].days;
  const bySheet = new Map<number, PeriodDay[]>();
  for (const day of days) {
    const index = Math.floor(day.column / perSheet);
    const column = day.column - index * perSheet;
    bySheet.set(index, [...(bySheet.get(index) ?? []), { ...day, column }]);
  }
  const sheets = [...bySheet.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, sheetDays]) => {
      const sheetFrom = addDays(from, index * perSheet);
      const { fields, marks } = periodFields(formType, sheetDays, residentName, org, sheetFrom);
      const sheetTo = addDays(sheetFrom, perSheet - 1);
      return { fields, marks, caption: `${sheetFrom}~${sheetTo} 별지 제${formType}호` };
    });
  return renderLegalForm({
    template,
    fontBytes,
    sheets,
    stamp: stampOf(training),
    title: `합성 사례 ${from}~${to} 별지 제${formType}호`,
  });
}
