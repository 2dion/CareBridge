// 도우미 교재 검색 순위(이슈 #219). 교재는 13절·약 2.9만 자라서 전부 가져와 앱에서 순위를 매긴다.
// 낱말마다 '그 낱말이 든 절이 적을수록' 점수를 높게 줘서 "어떻게·해야" 같은 흔한 말이 순위를 흐리지 않게 한다.
// 번역할 때 AI가 뽑은 핵심 낱말(keywords)은 두 배로 본다("숨쉬기 힘들다" → 호흡·숨).
import type { ManualSection } from "./ask";

// 낱말 끝 조사. 조사를 뗀 낱말도 함께 찾는다 (이슈 #183)
const KO_PARTICLE = /(이란|에는|에서|으로|이나|이랑|하고|은|는|이|가|을|를|에|의|도|로|란)$/u;

// 질문 틀에 나오는 흔한 말. 교재 절을 가려내는 데 도움이 되지 않는다.
const STOPWORDS = new Set([
  "어떻게",
  "어떤",
  "무엇",
  "무엇을",
  "뭐예요",
  "뭔가요",
  "하나요",
  "하세요",
  "해야",
  "해요",
  "있나요",
  "인가요",
  "알려",
  "알려주세요",
  "주세요",
  "제가",
  "저는",
]);

const normalize = (text: string) => text.normalize("NFC").toLowerCase();

/** 질문에서 검색에 쓸 낱말: 두 글자 이상, 조사를 뗀 낱말 포함, 흔한 말 제외, 중복 없음 */
export function queryTerms(question: string): string[] {
  const words = normalize(question)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, 10);
  const stems = words.map((word) => word.replace(KO_PARTICLE, ""));
  return [...new Set([...words, ...stems])].filter(
    (term) => term.length >= 2 && !STOPWORDS.has(term),
  );
}

const countOf = (text: string, term: string) => text.split(term).length - 1;

/** 질문·핵심 낱말과 맞는 절을 점수 순으로 limit개. 점수가 0이면 넣지 않는다 */
export function rankSections(
  sections: ManualSection[],
  question: string,
  keywords: string[] = [],
  limit = 3,
): ManualSection[] {
  const keywordTerms = keywords.map((k) => normalize(k).trim()).filter((k) => k.length >= 2);
  const weights = new Map<string, number>();
  for (const term of queryTerms(question)) weights.set(term, 1);
  for (const term of keywordTerms) weights.set(term, 2);

  const docs = sections.map((section) => ({
    section,
    title: normalize(`${section.chapter} ${section.title}`),
    body: normalize(section.body),
  }));
  const scored = docs.map((doc, index) => {
    let score = 0;
    for (const [term, weight] of weights) {
      const df = docs.filter((d) => d.title.includes(term) || d.body.includes(term)).length;
      if (df === 0) continue;
      const rarity = Math.log(1 + docs.length / df);
      const inTitle = doc.title.includes(term) ? 3 : 0;
      const occurrences = Math.min(countOf(doc.body, term), 3);
      const inBody = occurrences > 0 ? 1 + 0.5 * (occurrences - 1) : 0;
      score += weight * rarity * (inTitle + inBody);
    }
    return { section: doc.section, score, index };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.section);
}
