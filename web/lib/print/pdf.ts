import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

import type { DemoRecord } from "../demo/store";
import { addDays } from "../records/period-print";
import {
  type AttachedNote,
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

/** 별지의 제목과 머리말. 쪽이 서식과 떨어져도 누구의 어느 날짜 기록인지 알 수 있게 한다(이슈 #330) */
type AttachmentHead = { title: string; header: string };
/** 서식 한 장 분량: 칸·체크와, 그 장 바로 뒤에 붙는 별지의 제목·머리말 */
type FormSheet = { fields: PrintField[]; marks: PrintMark[]; attachment: AttachmentHead };

type RenderInput = {
  template: Uint8Array;
  fontBytes: Uint8Array;
  /** 서식 장 목록. 기록 1건 인쇄는 1장, 기간 인쇄는 날짜 열 수(제12호 7일, 제16호 3일)마다 1장 */
  sheets: FormSheet[];
  /** 쪽마다 위에 찍는 붉은 표시 글(쪽 번호 앞부분). 예: '합성 사례 · 공식 기록지 아님' */
  stamp: string;
  title: string;
  /** 기록에 작성자 이름이 없을 때(Mock 데모 기록) 별지에 적을 이름 */
  writer?: string;
};

const FORM_FONT_SIZE = 6;
const FORM_LINE_HEIGHT = 6.5;
const ELLIPSIS = "…";
// 별지(서식 뒤에 붙여 특이사항 글 전체를 찍는 쪽)의 글자 크기·줄 간격·여백(pt)
const ATTACH_MARGIN = 54;
const ATTACH_SIZE = 9;
const ATTACH_LINE_HEIGHT = 13;
const ATTACH_TITLE_SIZE = 11;

/** 별지 제목과 머리말(수급자·기관·날짜나 기간). 서식 머리말처럼 이름 뒤 ' 어르신'은 뺀다 */
function attachmentHead(
  formType: LegalFormType,
  residentName: string,
  org: string,
  period: string,
): AttachmentHead {
  return {
    title: `특이사항 별지 (별지 제${formType}호)`,
    header: `수급자: ${residentName.replace(/ 어르신$/, "")}   기관: ${org}   ${period}`,
  };
}

/** 별지에서 묶음마다 칸 이름 오른쪽에 찍는 작성자 줄. 서명은 종이에 직접 하도록 자리만 둔다 */
export const writerLine = (writer: string) => `작성자: ${writer.trim() || "          "} (서명)`;

export type FormPlan = {
  /** 서식 쪽에 찍을 칸. 특이사항 칸은 ‘별지 참조’, 넘친 긴 글 칸은 들어가는 줄까지만 두고 마지막 줄 끝을 '…'로 바꾼다 */
  cells: (PrintField & { lines: string[] })[];
  /** 별지에 찍을 묶음: 특이사항 글 전체와, 칸을 넘친 다른 긴 글 전체(칸 이름·작성자와 함께) */
  attached: AttachedNote[];
};

/**
 * 칸마다 줄을 나눈다. 특이사항 칸(attached)은 칸에 ‘별지 참조’만 두고 글 전체를 별지로 보낸다(이슈 #330).
 * 다른 긴 글(flow)이 칸을 넘치면 들어가는 줄까지만 서식에 두고 전체 글을 별지로 보낸다(이슈 #317).
 * 글자는 버리지 않는다. 넘칠 수 없는 칸(flow 아님)이 넘치면 오류다.
 * 근거: 문서/결정/2026-11-05-특이사항별지참조.md, 2026-11-05-인쇄이어쓰기쪽.md
 */
export function planLegalForm(fields: PrintField[], measure: (text: string) => number): FormPlan {
  const cells: FormPlan["cells"] = [];
  const attached: FormPlan["attached"] = [];
  for (const field of fields) {
    const lines = wrapText(field.text, field.width, measure);
    if (field.attached?.length) {
      cells.push({ ...field, lines });
      attached.push(...field.attached);
      continue;
    }
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
    attached.push({ label: field.label ?? field.key, text: field.text, writer: field.writer });
  }
  return { cells, attached };
}

/** 별지 한 줄. right는 같은 줄 오른쪽 끝에 찍는 글(작성자), start는 묶음의 첫 줄 */
type AttachRow = { text: string; gap: number; right?: string; start?: boolean };

/**
 * 법정 원문 첫 쪽을 서식 장마다 복제해 칸을 채운다. 서식 한 장에는 그 장의 날짜 열만 들어가고,
 * 날짜 열 수를 넘는 기간은 새 서식 장으로 넘긴다(결정 2026-11-05-기간인쇄여러장).
 * 특이사항이 있으면 그 장 바로 뒤에 별지를 붙여 수급자·기관·기간, 칸 이름, 작성자·서명 자리와 함께 글 전체를 찍는다(이슈 #330).
 * 뒤쪽 유의사항은 맨 끝에 한 번만 원문 그대로 붙인다. 기록 1건 인쇄와 기간 인쇄가 같은 방법으로 찍는다.
 */
async function renderLegalForm({ template, fontBytes, sheets, stamp, title, writer }: RenderInput) {
  const source = await PDFDocument.load(template);
  const output = await PDFDocument.create();
  const font = await embedPrintFont(output, fontBytes);
  const { width, height } = source.getPage(0).getSize();
  const contentWidth = width - ATTACH_MARGIN * 2;
  const measureAttach = (text: string) => font.widthOfTextAtSize(text, ATTACH_SIZE);
  const headerTop = height - 80;

  // 장마다 서식 칸과 별지 배치를 먼저 정해 전체 쪽 수를 안다
  const layouts = sheets.map((sheet) => {
    const plan = planLegalForm(sheet.fields, (text) =>
      font.widthOfTextAtSize(text, FORM_FONT_SIZE),
    );
    // 머리말(수급자·기관·기간)은 별지 쪽마다 찍는다. 기관 이름이 길면 줄을 나눈다
    const headerLines = wrapText(sheet.attachment.header, contentWidth, measureAttach);
    const ruleY = headerTop - (headerLines.length - 1) * ATTACH_LINE_HEIGHT - 7;
    const firstRowY = ruleY - 20;
    // 묶음: [칸 이름]과 그 오른쪽 '작성자: 이름 (서명)', 아래에 글 전체
    const rows: AttachRow[] = [];
    for (const block of plan.attached) {
      const gap = rows.length > 0 ? ATTACH_LINE_HEIGHT / 2 : 0;
      const sign = writerLine(block.writer ?? writer ?? "");
      const labelLines = wrapText(`[${block.label}]`, contentWidth, measureAttach);
      const fits =
        labelLines.length === 1 &&
        measureAttach(labelLines[0]) + measureAttach(sign) + ATTACH_SIZE <= contentWidth;
      if (fits) rows.push({ text: labelLines[0], gap, right: sign, start: true });
      else {
        // 칸 이름이 길면 작성자를 그 아래 줄 오른쪽에 찍는다
        labelLines.forEach((text, line) =>
          rows.push({ text, gap: line === 0 ? gap : 0, start: line === 0 }),
        );
        rows.push({ text: "", gap: 0, right: sign });
      }
      for (const text of wrapText(block.text, contentWidth, measureAttach))
        rows.push({ text, gap: 0 });
    }
    // 한 쪽에 다 안 들어가면 별지 쪽을 더한다. 묶음 첫 줄만 쪽 끝에 남지 않게 한 줄 자리를 더 본다
    const attachmentPages: (AttachRow & { y: number })[][] = [];
    let cursor = firstRowY;
    for (const row of rows) {
      const current = attachmentPages[attachmentPages.length - 1];
      const need = row.gap + (row.start ? ATTACH_LINE_HEIGHT : 0);
      if (!current || cursor - need < ATTACH_MARGIN) {
        attachmentPages.push([{ ...row, y: firstRowY }]);
        cursor = firstRowY - ATTACH_LINE_HEIGHT;
      } else {
        current.push({ ...row, y: cursor - row.gap });
        cursor -= row.gap + ATTACH_LINE_HEIGHT;
      }
    }
    return { sheet, plan, headerLines, ruleY, attachmentPages };
  });

  const pagesNeeded = layouts.reduce((sum, layout) => sum + 1 + layout.attachmentPages.length, 0);
  let pageIndex = 0;
  const drawStamp = (page: PDFPage, attachment: boolean) => {
    page.drawText(`${stamp} · ${pageIndex + 1}/${pagesNeeded}${attachment ? " 별지" : ""}`, {
      x: 54,
      y: height - 32,
      size: 8,
      font,
      color: rgb(0.65, 0.12, 0.12),
    });
    pageIndex += 1;
  };

  for (const { sheet, plan, headerLines, ruleY, attachmentPages } of layouts) {
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

    for (const pageRows of attachmentPages) {
      const page = output.addPage([width, height]);
      drawStamp(page, true);
      page.drawText(sheet.attachment.title, {
        x: ATTACH_MARGIN,
        y: height - 62,
        size: ATTACH_TITLE_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
      headerLines.forEach((text, line) =>
        page.drawText(text, {
          x: ATTACH_MARGIN,
          y: headerTop - line * ATTACH_LINE_HEIGHT,
          size: ATTACH_SIZE,
          font,
          color: rgb(0, 0, 0),
        }),
      );
      page.drawLine({
        start: { x: ATTACH_MARGIN, y: ruleY },
        end: { x: width - ATTACH_MARGIN, y: ruleY },
        thickness: 0.6,
        color: rgb(0.2, 0.2, 0.2),
      });
      for (const row of pageRows) {
        if (row.text)
          page.drawText(row.text, {
            x: ATTACH_MARGIN,
            y: row.y,
            size: ATTACH_SIZE,
            font,
            color: rgb(0, 0, 0),
          });
        // 작성자 이름은 기록의 작성자이고, 서명은 비워 둔다(종이에 직접 서명)
        if (row.right)
          page.drawText(row.right, {
            x: width - ATTACH_MARGIN - measureAttach(row.right),
            y: row.y,
            size: ATTACH_SIZE,
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
    /** 서식 장 + 별지 쪽 */
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
  writer,
  record,
  residentName,
  org,
  notesArea,
  training = false,
}: {
  template: Uint8Array;
  fontBytes: Uint8Array;
  /** 기록에 작성자 이름이 없을 때(Mock 데모 기록) 별지에 적을 이름 */
  writer?: string;
  record: DemoRecord;
  residentName: string;
  org: string;
  notesArea: NoteArea | "";
  training?: boolean;
}) {
  const { fields, marks } = printFields(record, residentName, org, notesArea);
  const title = `합성 사례 ${record.careDate} 별지 제${record.formType}호`;
  const attachment = attachmentHead(record.formType, residentName, org, `날짜: ${record.careDate}`);
  return renderLegalForm({
    template,
    fontBytes,
    sheets: [{ fields, marks, attachment }],
    stamp: stampOf(training, record.status === "approved" ? "" : " · 승인 전"),
    title,
    writer,
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
  writer,
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
  /** 기록에 작성자 이름이 없을 때(Mock 데모 기록) 별지에 적을 이름 */
  writer?: string;
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
      // 별지 머리말의 기간은 그 서식 장의 날짜이고, 고른 끝 날짜를 넘지 않는다
      const sheetEnd = addDays(sheetFrom, perSheet - 1);
      const sheetTo = sheetEnd < to ? sheetEnd : to;
      const attachment = attachmentHead(
        formType,
        residentName,
        org,
        `기간: ${sheetFrom} ~ ${sheetTo}`,
      );
      return { fields, marks, attachment };
    });
  return renderLegalForm({
    template,
    fontBytes,
    sheets,
    stamp: stampOf(training),
    title: `합성 사례 ${from}~${to} 별지 제${formType}호`,
    writer,
  });
}
