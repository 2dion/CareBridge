// W6(도우미) Mock 답변. 실제로는 POST /api/helper/ask가 교재 절(manual_sections)에서 찾아 답한다.
// 교재에 없으면 지어내지 않고 "찾지 못했어요"(화면 v1.3 W6, AGENTS.md 원칙 2).
// 용어 풀이는 data/glossary/glossary-v0.3.csv를 옮긴 glossary.json에서 찾는다.
import glossary from "./glossary.json";

export type HelperAnswer = {
  ko: string;
  vi: string;
  /** 교재 장·절·쪽. 못 찾았으면 null. */
  source: string | null;
  found: boolean;
};

const canned: { keys: string[][]; answer: HelperAnswer }[] = [
  {
    keys: [
      ["밥", "식사", "드시"],
      ["안", "싫", "거부"],
    ],
    answer: {
      ko: "먼저 식사를 원하지 않는 이유를 차분하게 여쭤보세요. 억지로 권하지 말고 평소와 다르면 관리자에게 알려주세요.",
      vi: "Hãy nhẹ nhàng hỏi vì sao người cao tuổi không muốn ăn. Đừng ép ăn; nếu có dấu hiệu khác thường, hãy báo người quản lý.",
      source: "요양보호사 표준교재 10장 3절 식사 돕기",
      found: true,
    },
  },
  {
    keys: [["넘어", "낙상"]],
    answer: {
      ko: "어르신을 바로 일으키지 말고 다친 곳이 있는지 먼저 살핀 뒤, 관리자에게 바로 알리세요.",
      vi: "Đừng vội đỡ dậy. Hãy kiểm tra chỗ bị thương trước rồi báo ngay cho người quản lý.",
      source: "요양보호사 표준교재 12장 응급상황 대처",
      found: true,
    },
  },
];

const notFound: HelperAnswer = {
  ko: "교재에서 이 내용에 대한 답을 찾지 못했어요. 관리자에게 물어보세요.",
  vi: "Mình không tìm thấy nội dung này trong giáo trình. Vui lòng hỏi người quản lý.",
  source: null,
  found: false,
};

export function mockHelperAnswer(question: string): HelperAnswer {
  const text = question.trim();
  for (const entry of canned) {
    if (entry.keys.every((group) => group.some((key) => text.includes(key)))) return entry.answer;
  }
  const term = glossary.find(
    (row) =>
      row.chapter &&
      [row.expression, ...row.aliases].some((form) => form.length >= 2 && text.includes(form)),
  );
  if (term) {
    return {
      ko: `‘${term.expression}’는 기록에 ‘${term.term_ko}’(이)라고 써요. ${term.plain_ko}.`,
      vi: `“${term.expression}” được ghi là “${term.term_vi}”.`,
      source: `요양보호사 표준교재 ${term.chapter}${term.page ? ` · ${term.page}쪽` : ""}`,
      found: true,
    };
  }
  return notFound;
}

export const helperSuggestions = [
  { label: "돌봄 중 사용하는 표현", question: "‘세수해 드렸어요’는 기록에 어떻게 써요?" },
  { label: "어르신 응대 방법", question: "어르신이 밥을 안 드시려고 해요. 어떻게 하면 좋을까요?" },
];
