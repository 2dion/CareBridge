// 실제 교재 매뉴얼(data/manual) 위에서 검색 순위 확인 (이슈 #226: 호흡곤란 질문에 교재 답)
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ManualSection } from "./ask";
import { rankSections } from "./manual-rank";

// 따옴표 안 줄바꿈·"" 이스케이프만 처리하는 작은 CSV 읽기
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const csv = readFileSync(
  join(__dirname, "../../../data/manual/manual-sections-v0.1.csv"),
  "utf-8",
).replace(/^﻿/, "");
const [header, ...records] = parseCsv(csv);
const col = (name: string) => header.indexOf(name);
const SECTIONS: ManualSection[] = records.map((r) => ({
  chapter: r[col("chapter")],
  title: r[col("title")],
  page: r[col("page")],
  body: r[col("body")],
}));

const pages = (question: string, keywords: string[] = []) =>
  rankSections(SECTIONS, question, keywords, 3).map((s) => s.page);

describe("교재 매뉴얼 데이터", () => {
  it("절마다 장·제목·쪽·본문이 있다", () => {
    expect(SECTIONS.length).toBe(15);
    for (const s of SECTIONS) {
      expect(s.chapter && s.title && s.page && s.body).toBeTruthy();
    }
  });

  it("번역 없는 한국어 질문 '숨이 가쁘다'에 호흡기계 절(p.190)이 첫째로 나온다", () => {
    expect(pages("어르신이 숨이 가쁘다고 하세요")[0]).toBe("190");
  });

  it("베트남어 질문은 번역 핵심 낱말(호흡곤란)로 호흡기계 절과 위기상황 절을 찾는다", () => {
    const found = pages("어르신이 숨이 가빠요, 어떻게 해야 하나요?", ["호흡곤란", "호흡", "숨"]);
    expect(found).toContain("190");
    expect(found).toContain("684–686");
  });

  it("질식 질문은 여전히 질식 절(p.701–702)이 첫째다", () => {
    expect(pages("어르신이 식사 중에 질식했어요", ["질식", "기도폐색"])[0]).toBe("701–702");
  });
});
