"""용어 번역 CSV(translations-<lang>.csv)로 glossary_translations 시드 SQL을 만든다.

쓰는 법 (저장소 루트에서):
    python3 data/glossary/build_translation_seeds.py          # vi zh mn en 모두
    python3 data/glossary/build_translation_seeds.py zh       # 한 언어만

- CSV의 term_id(T01~)는 사람용 번호라 DB에 없다. glossary-v0.3.csv의 같은 순번 줄에서
  (expression, term_ko)를 가져와 glossary 줄을 찾는다(glossary unique 키).
- 근거: 문서/결정/2026-11-03-용어번역표.md, 이슈 #314
"""

import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

LANG_NAME = {"vi": "베트남어", "zh": "중국어(간체자)", "mn": "몽골어(키릴 문자)", "en": "영어"}


def sql(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def read_csv(name: str) -> list[dict]:
    with open(HERE / name, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def build(lang: str) -> Path:
    glossary = read_csv("glossary-v0.3.csv")
    rows = read_csv(f"translations-{lang}.csv")
    if len(rows) != len(glossary):
        raise SystemExit(f"{lang}: 번역 {len(rows)}줄, 용어 {len(glossary)}줄 — 개수가 다름")
    for i, row in enumerate(rows, 1):
        if row["term_id"] != f"T{i:02d}":
            raise SystemExit(f"{lang}: {i}번째 줄 term_id가 {row['term_id']} (T{i:02d}이어야 함)")
        if not row["term"].strip():
            raise SystemExit(f"{lang}: {row['term_id']} 번역이 비어 있음")
        if row["reviewed"] not in ("true", "false"):
            raise SystemExit(f"{lang}: {row['term_id']} reviewed는 true/false")

    values = ",\n".join(
        f"  ({sql(g['expression'])}, {sql(g['term_ko'])}, {sql(r['term'])}, {r['reviewed']})"
        for g, r in zip(glossary, rows)
    )
    name = LANG_NAME[lang]
    out = HERE / f"seed-glossary-translations-{lang}.sql"
    out.write_text(
        f"""-- 용어 번역(glossary_translations) {name} 시드. 원본: data/glossary/translations-{lang}.csv (term_id, term, reviewed).
-- term_id는 CSV의 사람용 번호라 DB에 없으므로, 용어는 (expression, term_ko)로 찾아 잇는다(glossary unique 키).
-- 다시 돌려도 안전: 같은 (용어, 언어)면 번역 글만 맞춘다. 검수 전 {name}는 Claude 초안이다(reviewed = false).
-- 이 파일은 data/glossary/build_translation_seeds.py가 만든다. 고칠 때는 CSV를 고치고 다시 만든다.
-- 근거: 문서/결정/2026-11-03-용어번역표.md, 문서/설계/데이터구조-v2.3.6.md 'glossary_translations'
insert into public.glossary_translations (glossary_id, lang, term, reviewed)
select g.id, {sql(lang)}, v.term, v.reviewed
from (values
{values}
) as v (expression, term_ko, term, reviewed)
join public.glossary g on g.expression = v.expression and g.term_ko = v.term_ko
on conflict (glossary_id, lang) do update
  set term = excluded.term, reviewed = excluded.reviewed
  where public.glossary_translations.term is distinct from excluded.term
     or public.glossary_translations.reviewed is distinct from excluded.reviewed;
""",
        encoding="utf-8",
    )
    return out


if __name__ == "__main__":
    for lang in sys.argv[1:] or list(LANG_NAME):
        print("wrote", build(lang).relative_to(HERE.parent.parent))
