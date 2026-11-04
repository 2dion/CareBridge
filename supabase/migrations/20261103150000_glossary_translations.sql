-- 다국어 확장 단계 2(이슈 #259): 용어 번역을 언어별 표로 나누고, 기록에 작성 언어를 남긴다.
-- 근거: 문서/결정/2026-11-03-용어번역표.md, 문서/설계/데이터구조-v2.3.3.md 'glossary_translations'·'records'·'공통 계약',
--       문서/설계/다국어확장-v2.0.0.md '목표 구조 2~3'
-- 1. glossary_translations: 용어 1개 × 언어 1개 = 1행. 모든 기관이 함께 읽고, 넣기는 시드·SQL(service_role)만.
-- 2. 기존 glossary.term_vi를 vi 행으로 옮긴다. term_vi는 전환 기간 동안 남겨 두고 트리거로 같은 값을 유지한다.
-- 3. search_glossary(expression, max_results, lang): 결과에 term_native(그 언어 번역, 없으면 빈값). term_vi도 한동안 함께 준다.
-- 4. records.native_lang: 기록을 만든 때 작성자 언어. DB가 작성자 프로필에서 채우고, 만든 뒤 바꾸지 않는다.
-- 베트남어만 있는 지금 동작은 바뀌지 않는다. 공모전 DB(CareBridge)에는 적용하지 않는다.

-- ─────────────────────────────────────────────────────────
-- 1. 용어 번역 표
-- ─────────────────────────────────────────────────────────

create table public.glossary_translations (
  id uuid primary key default gen_random_uuid(),
  glossary_id uuid not null references public.glossary (id) on delete cascade,
  -- 언어를 더하면 이 목록을 마이그레이션으로 고친다(profiles.native_lang 제약과 같이). ko는 번역이 아니라 두지 않는다
  lang text not null check (lang in ('vi')),
  term text not null default '',
  -- 번역 검수자가 확인했는지. 시드는 false(Claude 초안)로 넣는다
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (glossary_id, lang)
);
comment on table public.glossary_translations is '용어(glossary)의 언어별 고정 번역. 1용어 1언어 1행. 기관 공통 읽기, 넣기는 시드·SQL';

alter table public.glossary_translations enable row level security;
revoke all on public.glossary_translations from anon, authenticated;
grant select on public.glossary_translations to authenticated;
create policy glossary_translations_select on public.glossary_translations for select to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────
-- 2. 기존 베트남어 옮기기 + 전환 기간 동기화
-- ─────────────────────────────────────────────────────────

insert into public.glossary_translations (glossary_id, lang, term)
select id, 'vi', term_vi from public.glossary where term_vi <> ''
on conflict (glossary_id, lang) do nothing;

-- 시드(data/glossary/seed-glossary.sql)가 아직 term_vi로 넣으므로, term_vi가 들어오면 vi 행도 같은 값으로 맞춘다.
-- 번역 글이 바뀌면 검수 표시는 내린다. term_vi 칸을 지울 때 이 트리거도 함께 지운다.
create function private.glossary_sync_term_vi() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.term_vi <> '' then
    insert into public.glossary_translations (glossary_id, lang, term)
    values (new.id, 'vi', new.term_vi)
    on conflict (glossary_id, lang) do update
      set term = excluded.term, reviewed = false
      where public.glossary_translations.term is distinct from excluded.term;
  end if;
  return new;
end $$;

create trigger glossary_sync_term_vi after insert or update of term_vi on public.glossary
  for each row execute function private.glossary_sync_term_vi();

-- ─────────────────────────────────────────────────────────
-- 3. 용어 검색에 언어 인자
-- ─────────────────────────────────────────────────────────

-- 반환 칸이 늘어 다시 만든다. 호출 쪽(Agent 도구 ②, 도우미)은 lang을 보내고, 보내지 않으면 vi.
drop function public.search_glossary(text, int);

create function public.search_glossary(expression text, max_results int default 5, lang text default 'vi')
returns table (
  id uuid, matched_expression text, term_ko text, term_vi text, term_native text, plain_ko text,
  chapter text, page text
)
language sql stable set search_path = ''
as $$
  with q as (select lower(trim(search_glossary.expression)) as q)
  select g.id, g.expression, g.term_ko, g.term_vi,
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
  'Agent 도구 search_glossary와 도우미가 부르는 용어 검색. lang = 작성자 모국어, term_native = 그 언어 고정 번역(없으면 빈값). term_vi는 전환 기간 칸';

-- ─────────────────────────────────────────────────────────
-- 4. 기록을 만든 때의 작성자 언어
-- ─────────────────────────────────────────────────────────

alter table public.records
  add column native_lang text not null default 'ko' check (native_lang in ('ko', 'vi'));
comment on column public.records.native_lang is
  '기록을 만든 때 작성자 모국어(profiles.native_lang). DB가 채우고 만든 뒤 바꾸지 않음. value_native 등 번역 칸의 언어';

-- 있던 기록은 지금 작성자 언어로 채운다. 승인한 기록은 records_before_update가 record_locked로 막고,
-- 이력 트리거가 남을 수 있어 채우는 동안만 이 표의 사용자 트리거를 끈다(상태·내용은 바꾸지 않음)
alter table public.records disable trigger user;
update public.records r
  set native_lang = p.native_lang
  from public.profiles p
  where p.id = r.worker_id and r.native_lang is distinct from p.native_lang;
alter table public.records enable trigger user;

-- 기록 만들기: 기관·서식은 어르신에서, 언어는 작성자 프로필에서. 보내온 native_lang은 믿지 않는다
create or replace function private.records_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r_org uuid;
  r_care text;
  worker_org uuid;
  worker_lang text;
begin
  select org_id, care_type into r_org, r_care from public.residents where id = new.resident_id;
  select org_id, native_lang into worker_org, worker_lang from public.profiles where id = new.worker_id;
  if worker_org is distinct from r_org then
    raise exception 'org_mismatch';
  end if;
  new.org_id := r_org;
  new.form_type := case r_care when 'facility' then 16 else 12 end;
  new.native_lang := coalesce(worker_lang, 'ko');
  return new;
end $$;

-- 만든 뒤에는 서버(service_role)도 바꾸지 못한다(care_date와 같이 고정)
create function private.records_keep_native_lang() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.native_lang <> old.native_lang then
    raise exception 'invalid_transition';
  end if;
  return new;
end $$;

create trigger records_keep_native_lang before update on public.records
  for each row execute function private.records_keep_native_lang();
