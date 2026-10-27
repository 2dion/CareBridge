import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, rgb } from "pdf-lib";

import type { DemoRecord } from "../demo/store";
import { type NoteArea, printFields } from "./fields";

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

export async function createRecordPdf({
  template,
  fontBytes,
  record,
  alias,
  org,
  notesArea,
}: {
  template: Uint8Array;
  fontBytes: Uint8Array;
  record: DemoRecord;
  alias: string;
  org: string;
  notesArea: NoteArea | "";
}) {
  const source = await PDFDocument.load(template);
  const output = await PDFDocument.create();
  output.registerFontkit(fontkit);
  // 고정 TrueType 전체를 포함해 CJK 글꼴 부분 포함(subset)의 뷰어별 누락을 피한다.
  const font: PDFFont = await output.embedFont(fontBytes, { subset: false });
  const { fields, marks } = printFields(record, alias, org, notesArea);
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
  // 이어쓰기도 같은 법정 원문을 복제한다. 뒤쪽 유의사항은 마지막에 원문 그대로 붙인다.
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
    page.drawText(
      `합성 사례 · 공식 기록지 아님${record.status === "approved" ? "" : " · 승인 전"} · ${index + 1}/${pagesNeeded}${index > 0 ? " 이어쓰기" : ""}`,
      {
        x: 54,
        y: page.getHeight() - 32,
        size: 8,
        font,
        color: rgb(0.65, 0.12, 0.12),
      },
    );
    // 실제 서명·생년월일·인정번호 등 없는 정보는 비워 둔다. 승인자를 종사자 서명으로 쓰지 않는다.
  }
  if (source.getPageCount() > 1) {
    const instructions = await output.copyPages(source, source.getPageIndices().slice(1));
    instructions.forEach((page) => output.addPage(page));
  }
  output.setTitle(`합성 사례 ${record.careDate} 별지 제${record.formType}호`);
  return {
    bytes: await output.save(),
    recordPages: pagesNeeded,
    totalPages: output.getPageCount(),
  };
}
