# data (AI 참고 자료)

정리: 전종혁 (데이터 담당) · 2026-10-21

AI가 짐작하지 않고 이 자료에서 찾아 쓰게 해서 "지어내지 않음"을 지킵니다. 모든 사례는 **합성**이고 실명·실제 기록은 없습니다(AGENTS.md 원칙 9).

> ⚠️ 이 폴더 위치(`data/`)는 임시입니다. 백엔드 담당이 위치를 정하면 옮깁니다. 코드 쪽 폴더라 이름은 영어로 씁니다(AGENTS.md '폴더·파일 이름 규칙').

| 폴더 | 무엇 | 쓰는 곳 | 상태 |
|---|---|---|---|
| `cases/` | 합성 사례와 정답표 | 시나리오 Mock 응답, 품질 측정(ai규칙-v1.1 '품질 확인 방법') | S-F01(시나리오 1) |
| `glossary/` | 용어 목록 50개 (기본 30 + 추가 20) | `glossary` 표 → `search_glossary` → Agent `search_terms`, W3 '용어 뜻 보기' | 시드 SQL 준비 |

## 합성 사례 형식

- `draft` = { `transcript_ko`, `items`(9개, 순서 고정), `form_fields` } — AI 규칙 v1.1 초안 모양. 시설(제16호)은 `form_fields`를 비우고 값은 항목의 `detail`에 둡니다(데이터 구조 v1.2 '서식 칸 대응').
- `transcript` = 받아쓴 원문(records.transcript). **근거(evidence)는 이 원문에 이어진 한 구간 그대로**입니다. 기록 검증 코드(`web/lib/agent/validate-draft.ts`)가 띄어쓰기·문장부호를 빼고 비교합니다.
- `evidence_ko`(근거의 한국어 뜻), `source_note`, `evidence_extra`는 사람이 보기 위한 칸입니다. 검증 코드는 무시합니다.
- `must_not_appear` = 품질 측정 때 "지어낸 내용"으로 세는 오답입니다.

## 용어 목록 (glossary/)

- `terms-v0.2.csv` = **사람이 고치는 원본**(표현, 검색 줄기, 교재 용어, 쉬운 풀이, 베트남어, 영문, 서식 칸, AI 사용 규칙, 교재 장·쪽 등).
- `glossary-v0.2.csv`, `seed-glossary.sql` = 원본에서 만든 `glossary` 표용 파일(칸: expression, aliases, term_ko, term_vi, plain_ko, chapter, page — 결정 2026-10-21-용어표). `aliases`에는 다른 표현과 **검색 줄기**(어미를 뺀 말: 세수, 자세 바꿔 …)가 들어갑니다. `search_glossary`가 받아쓴 문장 속 활용형도 찾게 하려는 것입니다.
- 교재 쪽은 「2026년 요양보호사 양성 표준교재」 인쇄 쪽. ⚠️ 베트남어는 Claude 초안(검수 전).
