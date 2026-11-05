-- 다국어 확장 단계 2 뒷정리 (이슈 #280): 옛 칸 glossary.term_vi와 동기화 트리거를 지운다.
-- 근거: 문서/결정/2026-11-03-용어번역표.md(전환 기간 뒤 term_vi 삭제), 문서/설계/데이터구조-v2.3.5.md 'glossary'
-- 번역의 기준은 v2.3.0부터 glossary_translations의 vi 행이고, 화면·서버·도우미·시드는 term_native만 쓴다.
-- 지우기 전에 term_vi에만 있고 vi 행이 없는 번역이 있으면 옮겨 둔다(없어야 정상, 안전망).

insert into public.glossary_translations (glossary_id, lang, term, reviewed)
select g.id, 'vi', g.term_vi, false
from public.glossary g
where g.term_vi <> ''
  and not exists (
    select 1 from public.glossary_translations t where t.glossary_id = g.id and t.lang = 'vi'
  );

drop trigger if exists glossary_sync_term_vi on public.glossary;
drop function if exists private.glossary_sync_term_vi();

-- 반환 칸이 줄어 다시 만든다. 호출 쪽(Agent 도구 ②, 도우미)은 term_native만 읽는다.
drop function public.search_glossary(text, int, text);

create function public.search_glossary(expression text, max_results int default 5, lang text default 'vi')
returns table (
  id uuid, matched_expression text, term_ko text, term_native text, plain_ko text,
  chapter text, page text
)
language sql stable set search_path = ''
as $$
  with q as (select lower(trim(search_glossary.expression)) as q)
  select g.id, g.expression, g.term_ko,
    coalesce((
      select t.term from public.glossary_translations t
      where t.glossary_id = g.id and t.lang = search_glossary.lang
    ), '') as term_native,
    g.plain_ko, g.chapter, g.page
  from public.glossary g, q
  where q.q <> ''
    and (
      strpos(lower(g.expression), q.q) > 0 or strpos(q.q, lower(g.expression)) > 0
      or strpos(lower(g.term_ko), q.q) > 0 or strpos(q.q, lower(g.term_ko)) > 0
      or exists (
        select 1 from unnest(g.aliases) a
        where strpos(lower(a), q.q) > 0 or strpos(q.q, lower(a)) > 0
      )
    )
  order by extensions.similarity(g.expression, q.q) desc, g.expression
  limit greatest(1, least(max_results, 20))
$$;

revoke execute on function public.search_glossary(text, int, text) from public, anon;
grant execute on function public.search_glossary(text, int, text) to authenticated, service_role;
comment on function public.search_glossary(text, int, text) is
  'Agent 도구 search_glossary와 도우미가 부르는 용어 검색. lang = 작성자 모국어, term_native = 그 언어 고정 번역(glossary_translations, 없으면 빈값)';

alter table public.glossary drop column term_vi;
