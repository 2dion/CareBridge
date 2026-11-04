import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, rgb } from "pdf-lib";

import type { DemoRecord } from "../demo/store";
import {
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

type RenderInput = {
  template: Uint8Array;
  fontBytes: Uint8Array;
  fields: PrintField[];
  marks: PrintMark[];
  /** 쪽마다 위에 찍는 붉은 표시 글(쪽 번호 앞부분). 예: '합성 사례 · 공식 기록지 아님' */
  stamp: string;
  title: string;
};

/**
 * 법정 원문 첫 쪽을 복제해 칸을 채운다. 긴 글(flow)은 같은 원문을 복제해 이어 쓰고, 뒤쪽 유의사항은 마지막에 원문 그대로 붙인다.
 * 기록 1건 인쇄와 기간 인쇄가 같은 방법으로 찍는다.
 */
async function renderLegalForm({ template, fontBytes, fields, marks, stamp, title }: RenderInput) {
  const source = await PDFDocument.load(template);
  const output = await PDFDocument.create();
  const font = await embedPrintFont(output, fontBytes);
  const size = 6;
  const lineHeight = 6.5;
  const prepared = fields.map((field) => {
    const lines = wrapText(field.text, field.width, (text) => font.widthOfTextAtSize(text, size));
    const capacity = Math.max(1, Math.floor(field.height / lineHeight));
    if (!field.flow && lines.length > capacity)
      throw new Error(`${field.key}: 양식 칸보다 긴 값입니다. 원래 기록을 확인해 주세요.`);
    return { ...field, lines, capacity };
  });
  const pagesNeeded = Math.max(
    1,
    ...prepared
      .filter((field) => field.flow)
      .map((field) => Math.ceil(field.lines.length / field.capacity)),
  );
  for (let index = 0; index < pagesNeeded; index++) {
    const [page] = await output.copyPages(source, [0]);
    output.addPage(page);
    for (const field of prepared) {
      const lines = field.flow
        ? field.lines.slice(index * field.capacity, (index + 1) * field.capacity)
        : field.lines;
      lines.forEach((text, line) =>
        page.drawText(text, {
          x: field.x,
          y: page.getHeight() - field.top - size - line * lineHeight,
          size,
          font,
          color: rgb(0, 0, 0),
        }),
      );
    }
    // 체크는 원문 체크 칸 안에 선 두 개로만 표시. 등록되지 않은 값은 추정하지 않는다.
    for (const mark of marks) {
      const y = page.getHeight() - mark.top;
      page.drawLine({
        start: { x: mark.x, y: y - 3 },
        end: { x: mark.x + 2, y: y - 5 },
        thickness: 0.8,
      });
      page.drawLine({
        start: { x: mark.x + 2, y: y - 5 },
        end: { x: mark.x + 6, y: y + 1 },
        thickness: 0.8,
      });
    }
    page.drawText(`${stamp} · ${index + 1}/${pagesNeeded}${index > 0 ? " 이어쓰기" : ""}`, {
      x: 54,
      y: page.getHeight() - 32,
      size: 8,
      font,
      color: rgb(0.65, 0.12, 0.12),
    });
    // 실제 서명·생년월일·인정번호 등 없는 정보는 비워 둔다. 승인자를 종사자 서명으로 쓰지 않는다.
  }
  if (source.getPageCount() > 1) {
    const instructions = await output.copyPages(source, source.getPageIndices().slice(1));
    instructions.forEach((page) => output.addPage(page));
  }
  output.setTitle(title);
  return {
    bytes: await output.save(),
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
  notesArea,
  training = false,
}: {
  template: Uint8Array;
  fontBytes: Uint8Array;
  record: DemoRecord;
  residentName: string;
  org: string;
  notesArea: NoteArea | "";
  training?: boolean;
}) {
  const { fields, marks } = printFields(record, residentName, org, notesArea);
  return renderLegalForm({
    template,
    fontBytes,
    fields,
    marks,
    stamp: stampOf(training, record.status === "approved" ? "" : " · 승인 전"),
    title: `합성 사례 ${record.careDate} 별지 제${record.formType}호`,
  });
}

/**
 * 기간 인쇄(M3 · 기간 인쇄): 승인한 기록 여러 날을 한 장의 날짜 열에 모아 찍는다(결정 2026-11-03-기간인쇄, 이슈 #261).
 * days의 column은 시작 날짜로부터 며칠째인지(0부터). 승인한 기록만 넣으므로 '승인 전' 표시는 쓰지 않는다.
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
  const { fields, marks } = periodFields(formType, days, residentName, org, from);
  return renderLegalForm({
    template,
    fontBytes,
    fields,
    marks,
    stamp: stampOf(training),
    title: `합성 사례 ${from}~${to} 별지 제${formType}호`,
  });
}
