-- 케어브릿지 첫 마이그레이션: 표 12개, 기관별 RLS, 상태 변화 검사, 녹음 버킷 audio
-- 근거: 문서/설계/데이터구조-v1.2.md ('표별 칸', '기록 상태 변화', '권한 규칙', '공통 계약')
--       문서/결정/2026-10-21-녹음업로드.md, 문서/결정/2026-10-21-용어표.md
--
-- 지키는 원칙 (AGENTS.md)
--   3. 정하지 않은 '확인 필요'가 남으면 승인 불가 → records 갱신 트리거가 다시 검사
--   4. source가 ai가 아니면 AI가 덮어쓰지 않음 → record_items 갱신 트리거
--   5. 승인 조건·권한·상태 변화는 코드(이 SQL과 서버 API)가 맡음
--   7. 모든 표는 기관별 RLS (manual_sections, glossary만 기관 공통 읽기)
--
-- 오류 메시지는 서버 API가 응답 코드로 바꿀 수 있게 짧은 영어 키로 씁니다.
--   record_locked, invalid_transition, not_record_worker, reviewer_only, training_org_only,
--   general_org_only, return_reason_required, unresolved_needs_check, training_reviewer_read_only,
--   human_value_protected, org_mismatch

create extension if not exists pg_trgm with schema extensions;

-- 권한 확인용 함수는 API로 드러나지 않는 private 스키마에 둡니다.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ─────────────────────────────────────────────────────────
-- 1. 표
-- ─────────────────────────────────────────────────────────

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_training boolean not null default false, -- 만들 때 정하고 바꾸지 않음
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  role text not null check (role in ('worker', 'reviewer')),
  name text not null,
  native_lang text not null default 'ko' check (native_lang in ('ko', 'vi')),
  font_size smallint not null default 2 check (font_size between 1 and 3),
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);
create index profiles_org_id_idx on public.profiles (org_id);

create table public.residents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  alias text not null,
  care_type text not null check (care_type in ('facility', 'home')),
  is_synthetic boolean not null default true,
  created_at timestamptz not null default now()
);
create index residents_org_id_idx on public.residents (org_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id), -- 트리거가 어르신의 기관으로 채움
  worker_id uuid not null references public.profiles (id) on delete cascade,
  resident_id uuid not null references public.residents (id) on delete cascade,
  schedule text not null default '',
  created_at timestamptz not null default now(),
  unique (worker_id, resident_id)
);
create index assignments_resident_id_idx on public.assignments (resident_id);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id), -- 트리거가 어르신의 기관으로 채움
  resident_id uuid not null references public.residents (id),
  worker_id uuid not null default auth.uid() references public.profiles (id),
  care_date date not null default current_date,
  form_type smallint not null check (form_type in (16, 12)), -- 트리거가 care_type에서 정함
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'returned', 'approved', 'commented')),
  transcript text not null default '',
  transcript_ko text not null default '',
  visit_start time,
  visit_end time,
  form_fields jsonb not null default '{}'::jsonb,
  return_reason text not null default '',
  return_reason_native text not null default '',
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index records_org_status_idx on public.records (org_id, status);
create index records_worker_id_idx on public.records (worker_id);
create index records_resident_id_idx on public.records (resident_id);

create table public.record_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  record_id uuid not null references public.records (id) on delete cascade,
  item_key text not null check (item_key in (
    'visit_time', 'support', 'meal', 'sleep', 'discomfort',
    'medication', 'cognition', 'notes', 'next_check'
  )),
  value_ko text not null default '',
  value_native text not null default '',
  status text not null default 'not_mentioned'
    check (status in ('observed', 'not_mentioned', 'needs_check')),
  evidence text not null default '',
  reason text not null default '',
  source text not null default 'ai' check (source in ('ai', 'worker', 'reviewer')),
  confirmed boolean not null default false,
  resolution text check (resolution in ('confirmed_by_reviewer', 'omitted')), -- null = 빈값
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (record_id, item_key),
  -- [기록 안 함]은 내용을 비우고 '언급 없음'으로 둠
  constraint omitted_is_empty check (
    resolution is distinct from 'omitted' or (status = 'not_mentioned' and value_ko = '')
  )
);

create table public.record_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  record_id uuid not null references public.records (id) on delete cascade,
  actor_id uuid default auth.uid() references public.profiles (id), -- null = 시스템
  type text not null check (type in (
    'created', 'ai_filled', 'edited', 'submitted', 'returned', 'commented', 'approved', 'resolved'
  )),
  item_key text check (item_key in (
    'visit_time', 'support', 'meal', 'sleep', 'discomfort',
    'medication', 'cognition', 'notes', 'next_check'
  )),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index record_events_record_id_idx on public.record_events (record_id, created_at);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  record_id uuid not null references public.records (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id),
  item_key text check (item_key in (
    'visit_time', 'support', 'meal', 'sleep', 'discomfort',
    'medication', 'cognition', 'notes', 'next_check'
  )), -- null = 기록 전체
  body text not null check (length(trim(body)) > 0),
  body_native text not null default '',
  created_at timestamptz not null default now()
);
create index comments_record_id_idx on public.comments (record_id);

create table public.audio_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  record_id uuid references public.records (id) on delete cascade, -- 도우미 질문(helper)만 비움
  worker_id uuid not null default auth.uid() references public.profiles (id), -- 올린 사람
  target text not null check (target in ('record', 'item', 'helper')),
  item_key text check (item_key in (
    'visit_time', 'support', 'meal', 'sleep', 'discomfort',
    'medication', 'cognition', 'notes', 'next_check'
  )),
  storage_path text unique, -- 같은 음성을 두 번 보내지 않음. 받아쓰기 뒤 비움
  status text not null default 'uploaded'
    check (status in ('uploaded', 'transcribing', 'filling', 'done', 'failed')),
  error text not null default '',
  created_at timestamptz not null default now(),
  constraint audio_jobs_record_needed check (target = 'helper' or record_id is not null),
  constraint audio_jobs_item_key_needed check (target <> 'item' or item_key is not null)
);
create index audio_jobs_record_id_idx on public.audio_jobs (record_id);

create table public.manual_sections (
  id uuid primary key default gen_random_uuid(),
  chapter text not null,
  title text not null,
  page text not null default '',
  body text not null,
  -- 한국어 사전이 없어 simple로 나눔
  search tsvector generated always as (
    to_tsvector('simple', chapter || ' ' || title || ' ' || body)
  ) stored,
  created_at timestamptz not null default now()
);
create index manual_sections_search_idx on public.manual_sections using gin (search);

create table public.glossary (
  id uuid primary key default gen_random_uuid(),
  expression text not null,
  aliases text[] not null default '{}',
  term_ko text not null,
  term_vi text not null default '',
  plain_ko text not null default '',
  chapter text not null default '',
  page text not null default '',
  created_at timestamptz not null default now(),
  unique (expression, term_ko)
);
create index glossary_expression_trgm_idx on public.glossary
  using gin (expression extensions.gin_trgm_ops);
create index glossary_term_ko_trgm_idx on public.glossary
  using gin (term_ko extensions.gin_trgm_ops);

create table public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  record_id uuid not null references public.records (id) on delete cascade,
  step_no int not null check (step_no >= 1),
  tool text not null
    check (tool in ('get_form_spec', 'search_terms', 'validate_draft', 'submit_draft')),
  input_summary text not null default '',
  result_summary text not null default '',
  reason text not null default '',
  duration_ms int,
  tokens int,
  created_at timestamptz not null default now()
);
create index agent_steps_record_id_idx on public.agent_steps (record_id, step_no);

-- ─────────────────────────────────────────────────────────
-- 2. 권한 확인 함수 (RLS 정책 안에서 profiles를 다시 읽어도 돌지 않게 security definer)
-- ─────────────────────────────────────────────────────────

create function private.my_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select org_id from public.profiles where id = auth.uid() $$;

create function private.is_reviewer() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'reviewer' from public.profiles where id = auth.uid()), false) $$;

create function private.is_worker() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'worker' from public.profiles where id = auth.uid()), false) $$;

create function private.my_org_is_training() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select o.is_training from public.profiles p
    join public.organizations o on o.id = p.org_id
    where p.id = auth.uid()
  ), false)
$$;

-- 녹음 경로 {org_id}/{record_id}/{uuid}.{webm|mp4} 가 내 기록(draft·returned)인지
create function private.can_use_audio_path(path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|mp4)$'
    and exists (
      select 1 from public.records r
      where r.org_id::text = split_part(path, '/', 1)
        and r.id::text = split_part(path, '/', 2)
        and r.worker_id = auth.uid()
        and r.status in ('draft', 'returned')
    )
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ─────────────────────────────────────────────────────────
-- 3. 트리거: 기관 채우기, 9개 항목 만들기, 상태 변화 검사, 이력
-- ─────────────────────────────────────────────────────────

-- 하위 표의 org_id는 화면이 보내지 않고 기록에서 가져옴 (기관이 섞이지 않게)
create function private.set_org_from_record() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.record_id is not null then
    select org_id into new.org_id from public.records where id = new.record_id;
  elsif new.org_id is null then
    new.org_id := private.my_org_id();
  end if;
  return new;
end $$;

create trigger record_items_set_org before insert on public.record_items
  for each row execute function private.set_org_from_record();
create trigger record_events_set_org before insert on public.record_events
  for each row execute function private.set_org_from_record();
create trigger comments_set_org before insert on public.comments
  for each row execute function private.set_org_from_record();
create trigger audio_jobs_set_org before insert on public.audio_jobs
  for each row execute function private.set_org_from_record();
create trigger agent_steps_set_org before insert on public.agent_steps
  for each row execute function private.set_org_from_record();

-- 담당 연결: 작성자와 어르신이 같은 기관이어야 함
create function private.assignments_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  worker_org uuid;
begin
  select org_id into new.org_id from public.residents where id = new.resident_id;
  select org_id into worker_org from public.profiles where id = new.worker_id;
  if worker_org is distinct from new.org_id then
    raise exception 'org_mismatch';
  end if;
  return new;
end $$;

create trigger assignments_before_insert before insert or update on public.assignments
  for each row execute function private.assignments_before_insert();

-- 기록 만들기: 기관·서식은 어르신에서 정하고, 작성자는 같은 기관이어야 함
create function private.records_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r_org uuid;
  r_care text;
  worker_org uuid;
begin
  select org_id, care_type into r_org, r_care from public.residents where id = new.resident_id;
  select org_id into worker_org from public.profiles where id = new.worker_id;
  if worker_org is distinct from r_org then
    raise exception 'org_mismatch';
  end if;
  new.org_id := r_org;
  new.form_type := case r_care when 'facility' then 16 else 12 end;
  return new;
end $$;

create trigger records_before_insert before insert on public.records
  for each row execute function private.records_before_insert();

-- 기록 1건에 9개 항목(빈 항목도 '언급 없음')과 created 이력
create function private.records_after_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.record_items (org_id, record_id, item_key)
  select new.org_id, new.id, k
  from unnest(array[
    'visit_time', 'support', 'meal', 'sleep', 'discomfort',
    'medication', 'cognition', 'notes', 'next_check'
  ]) as k;

  insert into public.record_events (org_id, record_id, actor_id, type, after)
  values (new.org_id, new.id, auth.uid(), 'created', jsonb_build_object('status', new.status));
  return new;
end $$;

create trigger records_after_insert after insert on public.records
  for each row execute function private.records_after_insert();

-- 상태 변화 (데이터 구조 v1.2 '기록 상태 변화' 표). 서버 API도 같은 검사를 먼저 하고 409를 돌려줌.
create function private.records_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  training boolean;
  unresolved int;
begin
  if old.status in ('approved', 'commented') then
    raise exception 'record_locked';
  end if;
  if new.org_id <> old.org_id or new.resident_id <> old.resident_id
     or new.worker_id <> old.worker_id or new.form_type <> old.form_type then
    raise exception 'invalid_transition';
  end if;

  select is_training into training from public.organizations where id = old.org_id;

  if new.status is distinct from old.status then
    if old.status in ('draft', 'returned') and new.status = 'submitted' then
      if uid is not null and uid <> old.worker_id then
        raise exception 'not_record_worker';
      end if;
      new.submitted_at := now();

    elsif old.status = 'submitted' and new.status = 'returned' then
      if uid is not null and not private.is_reviewer() then raise exception 'reviewer_only'; end if;
      if training then raise exception 'general_org_only'; end if;
      if trim(new.return_reason) = '' then raise exception 'return_reason_required'; end if;

    elsif old.status = 'submitted' and new.status = 'approved' then
      if uid is not null and not private.is_reviewer() then raise exception 'reviewer_only'; end if;
      if training then raise exception 'general_org_only'; end if;
      select count(*) into unresolved from public.record_items
        where record_id = old.id and status = 'needs_check' and resolution is null;
      if unresolved > 0 then
        raise exception 'unresolved_needs_check' using detail = unresolved::text;
      end if;
      new.approved_at := now();
      new.approved_by := uid;

    elsif old.status = 'submitted' and new.status = 'commented' then
      if uid is not null and not private.is_reviewer() then raise exception 'reviewer_only'; end if;
      if not training then raise exception 'training_org_only'; end if;

    else
      raise exception 'invalid_transition';
    end if;
  end if;

  -- 강사(교육용 담당자)는 기록 내용을 고치지 않음
  if training and uid is not null and uid <> old.worker_id
     and (new.care_date, new.transcript, new.transcript_ko, new.visit_start, new.visit_end,
          new.form_fields, new.return_reason, new.return_reason_native)
         is distinct from
         (old.care_date, old.transcript, old.transcript_ko, old.visit_start, old.visit_end,
          old.form_fields, old.return_reason, old.return_reason_native) then
    raise exception 'training_reviewer_read_only';
  end if;

  -- 시각·승인자는 위 상태 변화에서만 바뀜
  if not (new.status = 'submitted' and old.status is distinct from 'submitted') then
    new.submitted_at := old.submitted_at;
  end if;
  if new.status <> 'approved' then
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  return new;
end $$;

create trigger records_before_update before update on public.records
  for each row execute function private.records_before_update();

create function private.records_after_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.record_events (org_id, record_id, actor_id, type, before, after)
    values (
      new.org_id, new.id, auth.uid(), new.status,
      jsonb_build_object('status', old.status),
      case when new.status = 'returned'
        then jsonb_build_object('status', new.status, 'return_reason', new.return_reason)
        else jsonb_build_object('status', new.status)
      end
    );
  end if;
  return new;
end $$;

create trigger records_after_update after update on public.records
  for each row execute function private.records_after_update();

create function private.records_before_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status in ('approved', 'commented') then
    raise exception 'record_locked';
  end if;
  return old;
end $$;

create trigger records_before_delete before delete on public.records
  for each row execute function private.records_before_delete();

-- 항목 고치기: 잠긴 기록, 담당자만 resolution, AI 덮어쓰기 금지, 되돌림 재확인, 확인 풀림
create function private.record_items_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rec_status text;
  rec_worker uuid;
begin
  select status, worker_id into rec_status, rec_worker from public.records where id = old.record_id;
  if rec_status in ('approved', 'commented') then
    raise exception 'record_locked';
  end if;

  if new.resolution is distinct from old.resolution
     and uid is not null and not private.is_reviewer() then
    raise exception 'reviewer_only';
  end if;

  -- 원칙 4: 사람이 쓴 값(source = worker / reviewer)은 AI가 덮어쓰지 않음
  if old.source <> 'ai' and new.source = 'ai'
     and (new.value_ko, new.value_native, new.status, new.evidence, new.reason, new.detail)
         is distinct from
         (old.value_ko, old.value_native, old.status, old.evidence, old.reason, old.detail) then
    raise exception 'human_value_protected';
  end if;

  -- 되돌린 기록에서 작성자가 고친 항목(음성 보태기로 AI가 바꾼 것 포함)은 담당자가 다시 확인
  -- 근거: 문서/결정/2026-10-21-되돌림재확인.md
  if rec_status = 'returned' and (uid is null or uid = rec_worker)
     and (new.value_ko, new.status, new.detail) is distinct from (old.value_ko, old.status, old.detail) then
    new.resolution := null;
  end if;

  -- 작성자가 아닌 사람이 고치면 확인이 풀리고, [맞아요]는 작성자만 누름
  if uid is not null and uid <> rec_worker then
    if new.value_ko is distinct from old.value_ko then
      new.confirmed := false;
    else
      new.confirmed := old.confirmed;
    end if;
  end if;
  return new;
end $$;

create trigger record_items_before_update before update on public.record_items
  for each row execute function private.record_items_before_update();

-- ─────────────────────────────────────────────────────────
-- 4. 용어 검색 (Agent 도구 ② search_terms가 부름)
-- ─────────────────────────────────────────────────────────

-- 입력 표현이 용어 표현을 품거나(받아쓴 글이 더 김), 용어 표현이 입력을 품으면 후보.
-- like 대신 strpos를 써서 %·_ 가 섞인 입력도 글자 그대로 찾음.
create function public.search_glossary(expression text, max_results int default 5)
returns table (
  id uuid, matched_expression text, term_ko text, term_vi text, plain_ko text,
  chapter text, page text
)
language sql stable set search_path = ''
as $$
  with q as (select lower(trim(search_glossary.expression)) as q)
  select g.id, g.expression, g.term_ko, g.term_vi, g.plain_ko, g.chapter, g.page
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

revoke execute on function public.search_glossary(text, int) from public, anon;
grant execute on function public.search_glossary(text, int) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────
-- 5. 표 권한(GRANT): 로그인한 사람만, 고칠 수 있는 칸만
-- ─────────────────────────────────────────────────────────

revoke all on
  public.organizations, public.profiles, public.residents, public.assignments,
  public.records, public.record_items, public.record_events, public.comments,
  public.audio_jobs, public.manual_sections, public.glossary, public.agent_steps
from anon, authenticated;

grant select on
  public.organizations, public.profiles, public.residents, public.assignments,
  public.records, public.record_items, public.record_events, public.comments,
  public.audio_jobs, public.manual_sections, public.glossary, public.agent_steps
to authenticated;

grant update (native_lang, font_size, onboarded) on public.profiles to authenticated;
grant insert, update, delete on public.residents to authenticated;
grant insert, update, delete on public.assignments to authenticated;
grant insert (resident_id, care_date, visit_start, visit_end) on public.records to authenticated;
grant update (
  care_date, status, transcript, transcript_ko, visit_start, visit_end,
  form_fields, return_reason, return_reason_native
) on public.records to authenticated;
grant update (
  value_ko, value_native, status, evidence, reason, source, confirmed, resolution, detail
) on public.record_items to authenticated;
grant insert (record_id, type, item_key, before, after) on public.record_events to authenticated;
grant insert (record_id, item_key, body, body_native) on public.comments to authenticated;
grant insert (record_id, target, item_key, storage_path) on public.audio_jobs to authenticated;
grant update (storage_path, status, error) on public.audio_jobs to authenticated;
grant insert (
  record_id, step_no, tool, input_summary, result_summary, reason, duration_ms, tokens
) on public.agent_steps to authenticated;

-- ─────────────────────────────────────────────────────────
-- 6. RLS (데이터 구조 v1.2 '권한 규칙' 표)
-- ─────────────────────────────────────────────────────────

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.residents enable row level security;
alter table public.assignments enable row level security;
alter table public.records enable row level security;
alter table public.record_items enable row level security;
alter table public.record_events enable row level security;
alter table public.comments enable row level security;
alter table public.audio_jobs enable row level security;
alter table public.manual_sections enable row level security;
alter table public.glossary enable row level security;
alter table public.agent_steps enable row level security;

-- organizations: 내 기관만 읽기. 만들기·바꾸기는 대시보드(service_role)만
create policy organizations_select on public.organizations for select to authenticated
  using (id = private.my_org_id());

-- profiles: 같은 기관 계정 읽기, 내 설정만 고치기
create policy profiles_select on public.profiles for select to authenticated
  using (org_id = private.my_org_id());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- residents: 작성자는 담당 어르신만 읽기, 담당자·강사는 같은 기관 전체 읽기·쓰기
create policy residents_select on public.residents for select to authenticated
  using (
    org_id = private.my_org_id()
    and (
      private.is_reviewer()
      or exists (
        select 1 from public.assignments a
        where a.resident_id = residents.id and a.worker_id = auth.uid()
      )
    )
  );
create policy residents_reviewer_insert on public.residents for insert to authenticated
  with check (org_id = private.my_org_id() and private.is_reviewer());
create policy residents_reviewer_update on public.residents for update to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer())
  with check (org_id = private.my_org_id());
create policy residents_reviewer_delete on public.residents for delete to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer());

-- assignments: 작성자는 내 담당만, 담당자는 같은 기관 전체
create policy assignments_select on public.assignments for select to authenticated
  using (org_id = private.my_org_id() and (worker_id = auth.uid() or private.is_reviewer()));
create policy assignments_reviewer_insert on public.assignments for insert to authenticated
  with check (private.is_reviewer() and exists (
    select 1 from public.residents r
    where r.id = resident_id and r.org_id = private.my_org_id()
  ));
create policy assignments_reviewer_update on public.assignments for update to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer())
  with check (org_id = private.my_org_id());
create policy assignments_reviewer_delete on public.assignments for delete to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer());

-- records: 작성자는 내 기록, 담당자·강사는 같은 기관 전체 읽기
create policy records_select on public.records for select to authenticated
  using (org_id = private.my_org_id() and (worker_id = auth.uid() or private.is_reviewer()));
-- 작성자가 담당 어르신의 기록을 draft로 만듦 (org_id·form_type은 트리거가 채움)
create policy records_worker_insert on public.records for insert to authenticated
  with check (
    private.is_worker()
    and worker_id = auth.uid()
    and status = 'draft'
    and exists (
      select 1 from public.assignments a
      where a.resident_id = records.resident_id and a.worker_id = auth.uid()
    )
  );
-- 작성자: draft·returned일 때만 (보내기 포함)
create policy records_worker_update on public.records for update to authenticated
  using (worker_id = auth.uid() and status in ('draft', 'returned'))
  with check (worker_id = auth.uid());
-- 담당자: submitted일 때만 (수정·되돌리기·승인. 강사는 트리거가 코멘트로만 제한)
create policy records_reviewer_update on public.records for update to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer() and status = 'submitted')
  with check (org_id = private.my_org_id());

-- record_items: 읽기는 기록을 볼 수 있으면. 행은 트리거만 만듦
create policy record_items_select on public.record_items for select to authenticated
  using (
    org_id = private.my_org_id()
    and exists (select 1 from public.records r where r.id = record_items.record_id)
  );
create policy record_items_worker_update on public.record_items for update to authenticated
  using (exists (
    select 1 from public.records r
    where r.id = record_items.record_id
      and r.worker_id = auth.uid() and r.status in ('draft', 'returned')
  ))
  with check (org_id = private.my_org_id());
-- 강사(교육용)는 항목을 고치지 않음
create policy record_items_reviewer_update on public.record_items for update to authenticated
  using (
    org_id = private.my_org_id()
    and private.is_reviewer()
    and not private.my_org_is_training()
    and exists (
      select 1 from public.records r
      where r.id = record_items.record_id and r.status = 'submitted'
    )
  )
  with check (org_id = private.my_org_id());

-- record_events: 기록을 볼 수 있으면 읽기. 상태 이력(created·submitted 등)은 트리거만 씀
create policy record_events_select on public.record_events for select to authenticated
  using (
    org_id = private.my_org_id()
    and exists (select 1 from public.records r where r.id = record_events.record_id)
  );
create policy record_events_insert on public.record_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and type in ('ai_filled', 'edited', 'resolved')
    and exists (
      select 1 from public.records r
      where r.id = record_events.record_id and r.org_id = private.my_org_id()
        and r.status not in ('approved', 'commented')
    )
  );

-- comments: 기록을 볼 수 있으면 읽기. 쓰기는 교육용 기관 강사가 submitted 기록에만
create policy comments_select on public.comments for select to authenticated
  using (
    org_id = private.my_org_id()
    and exists (select 1 from public.records r where r.id = comments.record_id)
  );
create policy comments_trainer_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.is_reviewer()
    and private.my_org_is_training()
    and exists (
      select 1 from public.records r
      where r.id = comments.record_id and r.org_id = private.my_org_id()
        and r.status = 'submitted'
    )
  );

-- audio_jobs: 올린 작성자가 읽기·쓰기, 담당자는 같은 기관 읽기
create policy audio_jobs_select on public.audio_jobs for select to authenticated
  using (
    org_id = private.my_org_id() and (worker_id = auth.uid() or private.is_reviewer())
  );
create policy audio_jobs_worker_insert on public.audio_jobs for insert to authenticated
  with check (
    worker_id = auth.uid()
    and private.is_worker()
    and (
      record_id is null
      or exists (
        select 1 from public.records r
        where r.id = audio_jobs.record_id
          and r.worker_id = auth.uid() and r.status in ('draft', 'returned')
      )
    )
  );
create policy audio_jobs_worker_update on public.audio_jobs for update to authenticated
  using (worker_id = auth.uid()) with check (worker_id = auth.uid());

-- agent_steps: 서버가 작성자 권한으로 Agent를 돌릴 때 씀, 담당자·강사가 읽음
create policy agent_steps_select on public.agent_steps for select to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer());
create policy agent_steps_worker_insert on public.agent_steps for insert to authenticated
  with check (exists (
    select 1 from public.records r
    where r.id = agent_steps.record_id
      and r.worker_id = auth.uid() and r.status in ('draft', 'returned')
  ));

-- manual_sections, glossary: 기관 공통, 읽기만 (넣기는 시드·SQL)
create policy manual_sections_select on public.manual_sections for select to authenticated
  using (true);
create policy glossary_select on public.glossary for select to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────
-- 7. 녹음 버킷 audio (결정 기록 2026-10-21-녹음업로드)
-- ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 10485760, array['audio/webm', 'audio/mp4'])
on conflict (id) do nothing;

-- 작성자가 내 기록(draft·returned) 경로에만 올리기·읽기·지우기. 담당자·강사는 접근 안 함.
-- 1회용 업로드 주소(createSignedUploadUrl)도 만드는 사람의 insert 권한을 봄.
create policy audio_worker_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and private.can_use_audio_path(name));
create policy audio_worker_select on storage.objects for select to authenticated
  using (bucket_id = 'audio' and private.can_use_audio_path(name));
create policy audio_worker_delete on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and private.can_use_audio_path(name));
