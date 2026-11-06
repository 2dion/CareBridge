-- 이슈 #362 (#315 QA 확인): 모국어로 받아쓴 글의 낱말로도 용어를 찾는다.
-- 근거: 문서/결정/2026-11-06-용어모국어검색.md, 문서/설계/ai규칙-v2.0.6.md 도구 ②, 문서/설계/데이터구조-v2.3.6.md 'glossary'
-- 전에는 expression·aliases·term_ko(모두 한국어)에서만 찾아, Agent가 몽골어 'зутан', 중국어 '粥', 영어 'porridge'를 넣으면
-- 늘 빈 결과였다. lang의 고정 번역(glossary_translations.term)과도 맞춰 본다.
--   · 번역의 괄호 설명 앞부분만 본다: 'Зутан (шингэн будаа)' → 'зутан'
--   · 표현이 번역을 품거나('зутангийн талыг орчим' ⊃ 'зутан'), 3글자 이상 표현을 번역이 품으면 맞는 것으로 본다
--   · 사전 방언 풀이(chapter가 '우리말샘'으로 시작)는 번역이 뜻풀이라 모국어로는 찾지 않는다
--     (찾으면 Agent가 '짐작'으로 보고 '확인 필요'를 늘린다)
--   · 3바이트보다 짧은 번역(영문 1~2자)은 오탐이 많아 뺀다. 한자 1자(3바이트)는 낱말이라 둔다
-- 인자·반환 칸·권한은 그대로다. 한국어 검색 결과도 그대로다(같은 조건에 or로 더함).

create or replace function public.search_glossary(expression text, max_results int default 5, lang text default 'vi')
returns table (
  id uuid, matched_expression text, term_ko text, term_native text, plain_ko text,
  chapter text, page text
)
language sql stable set search_path = ''
as $$
  with q as (select lower(trim(search_glossary.expression)) as q),
  native as (
    select t.glossary_id, t.term,
      lower(trim(split_part(split_part(t.term, '(', 1), '（', 1))) as head
    from public.glossary_translations t
    where t.lang = search_glossary.lang and t.term <> ''
  )
  select g.id, g.expression, g.term_ko, coalesce(n.term, '') as term_native,
    g.plain_ko, g.chapter, g.page
  from public.glossary g
  cross join q
  left join native n on n.glossary_id = g.id
  where q.q <> ''
    and (
      strpos(lower(g.expression), q.q) > 0 or strpos(q.q, lower(g.expression)) > 0
      or strpos(lower(g.term_ko), q.q) > 0 or strpos(q.q, lower(g.term_ko)) > 0
      or exists (
        select 1 from unnest(g.aliases) a
        where strpos(lower(a), q.q) > 0 or strpos(q.q, lower(a)) > 0
      )
      or (
        n.head is not null
        and octet_length(n.head) >= 3
        and g.chapter not like '우리말샘%'
        and (
          strpos(q.q, n.head) > 0
          or (char_length(q.q) >= 3 and strpos(n.head, q.q) > 0)
        )
      )
    )
  order by greatest(
      extensions.similarity(g.expression, q.q),
      coalesce(extensions.similarity(n.head, q.q), 0)
    ) desc, g.expression
  limit greatest(1, least(max_results, 20))
$$;

comment on function public.search_glossary(text, int, text) is
  'Agent 도구 search_glossary와 도우미가 부르는 용어 검색. lang = 작성자 모국어, term_native = 그 언어 고정 번역(glossary_translations, 없으면 빈값). 한국어 표현·별칭·용어와, lang의 고정 번역(교재 용어만)으로 찾는다(이슈 #362)';
