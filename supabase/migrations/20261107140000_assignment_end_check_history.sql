-- 이슈 #379·#380: 담당이 끝난 어르신은 작성자 화면에 전혀 보이지 않게 하고, 담당을 끊기 전에 남은 일을 검사하며, 담당 이력을 남긴다.
-- 근거: 문서/결정/2026-11-07-담당끊기전검사.md, 문서/설계/데이터구조-v2.3.9.md 'assignments'·'assignment_history'·권한 규칙
--
-- 1. records_select: 작성자는 지금 담당인 어르신의 자기 기록만 읽는다(#367의 draft·returned 예외를 없앰).
--    audio_jobs_select·record_items·record_events·comments는 "기록을 읽을 수 있으면"이라 그대로 따른다.
-- 2. submit_own_record: 지금 담당일 때만 보낸다(security definer라 RLS 대신 함수가 담당을 본다).
-- 3. assignments 지우기 전 검사: 그 작성자·어르신에 승인까지 끝나지 않은 기록(draft·submitted·returned)이나
--    지난 30일 빈 날(기록도 기록 없음 처리도 없는 날)이 남아 있으면 거절(assignment_open_work).
--    어르신·프로필 삭제에 딸려 지워질 때(on delete cascade)는 검사하지 않는다.
-- 4. assignment_history: 담당 연결이 생기고·바뀌고·끝날 때 트리거가 쌓는다. 관리자·강사만 읽고, 쓰기는 트리거만.
-- 코디세이 DB(fffgpgrnppxxqccncstf)에만 적용한다. 공모전 DB(CareBridge)에는 적용하지 않는다.

-- ─────────────────────────────────────────────────────────
-- 1. 기록 읽기: 지금 담당인 어르신의 자기 기록만
-- ─────────────────────────────────────────────────────────
drop policy records_select on public.records;
create policy records_select on public.records for select to authenticated
  using (
    org_id = private.my_org_id()
    and (
      private.is_reviewer()
      or (
        worker_id = auth.uid()
        and exists (
          select 1 from public.assignments a
          where a.resident_id = records.resident_id and a.worker_id = auth.uid()
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────
-- 2. 보내기: 작성자 본인 + 지금 담당
-- ─────────────────────────────────────────────────────────
create or replace function public.submit_own_record(p_record_id uuid, p_from text)
returns table (status text, submitted_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or p_from not in ('draft', 'returned') then
    return;
  end if;
  return query
    update public.records r
    set status = 'submitted'
    where r.id = p_record_id and r.worker_id = auth.uid() and r.status = p_from
      and exists (
        select 1 from public.assignments a
        where a.resident_id = r.resident_id and a.worker_id = auth.uid()
      )
    returning r.status, r.submitted_at;
end $$;
comment on function public.submit_own_record(uuid, text) is
  '작성자 본인의 draft·returned 기록을 보냄. 지금 담당일 때만(이슈 #367·#379)';

-- ─────────────────────────────────────────────────────────
-- 3. 담당 끊기 전 검사
-- ─────────────────────────────────────────────────────────
-- 한 담당 연결의 남은 일: 승인까지 끝나지 않은 기록 수, 지난 30일(어제~30일 전) 빈 날 수.
-- 빈 날 계산은 list_missed_records·list_overdue_records와 같은 규칙(start_date부터, 시설 매일, 재가 visit_days).
create function private.assignment_open_work(p_worker_id uuid, p_resident_id uuid, p_start date, p_visit_days smallint[])
returns table (open_records int, empty_days int)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*)::int from public.records rec
      where rec.worker_id = p_worker_id and rec.resident_id = p_resident_id
        and rec.status in ('draft', 'submitted', 'returned')),
    (select count(*)::int
      from generate_series(1, 30) as n
      cross join lateral (select ((now() at time zone 'Asia/Seoul')::date - n)::date as d) days
      join public.residents r on r.id = p_resident_id
      where days.d >= p_start
        and (
          r.care_type = 'facility'
          or (r.care_type = 'home' and extract(isodow from days.d)::smallint = any (p_visit_days))
        )
        and not exists (
          select 1 from public.no_care_days nc
          where nc.resident_id = p_resident_id and nc.care_date = days.d
        )
        and not exists (
          select 1 from public.records rec
          where rec.worker_id = p_worker_id and rec.resident_id = p_resident_id and rec.care_date = days.d
        ))
$$;
revoke execute on function private.assignment_open_work(uuid, uuid, date, smallint[]) from public, anon, authenticated;

create function private.assignments_before_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  w record;
begin
  -- 어르신·프로필 삭제에 딸려 지워지는 경우(외래 키 트리거 안에서 돎)는 검사하지 않는다
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  select * into w from private.assignment_open_work(old.worker_id, old.resident_id, old.start_date, old.visit_days);
  if w.open_records > 0 or w.empty_days > 0 then
    raise exception 'assignment_open_work'
      using detail = json_build_object('open_records', w.open_records, 'empty_days', w.empty_days)::text;
  end if;
  return old;
end $$;

create trigger assignments_before_delete before delete on public.assignments
  for each row execute function private.assignments_before_delete();

-- ─────────────────────────────────────────────────────────
-- 4. 담당 이력
-- ─────────────────────────────────────────────────────────
create table public.assignment_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  resident_id uuid not null references public.residents (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date, -- 담당 끝난 날(이날까지 담당). 지금 담당이면 비움
  visit_days smallint[],
  ended_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index assignment_history_resident_idx on public.assignment_history (resident_id, start_date desc);
create unique index assignment_history_open_idx on public.assignment_history (worker_id, resident_id)
  where end_date is null;

alter table public.assignment_history enable row level security;
create policy assignment_history_select on public.assignment_history for select to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer());
revoke insert, update, delete on public.assignment_history from anon, authenticated;
grant select on public.assignment_history to authenticated;

create function private.assignments_history() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if tg_op = 'INSERT' then
    insert into public.assignment_history (org_id, resident_id, worker_id, start_date, visit_days)
    values (new.org_id, new.resident_id, new.worker_id, new.start_date, new.visit_days);
  elsif tg_op = 'UPDATE' then
    if new.start_date is distinct from old.start_date or new.visit_days is distinct from old.visit_days then
      update public.assignment_history
      set start_date = new.start_date, visit_days = new.visit_days
      where worker_id = new.worker_id and resident_id = new.resident_id and end_date is null;
    end if;
  else
    -- 시작일 전에 끊으면 담당한 날이 없어 이력을 남기지 않는다
    delete from public.assignment_history
    where worker_id = old.worker_id and resident_id = old.resident_id and end_date is null
      and start_date > today;
    update public.assignment_history
    set end_date = today, ended_by = auth.uid()
    where worker_id = old.worker_id and resident_id = old.resident_id and end_date is null;
  end if;
  return null;
end $$;

create trigger assignments_history after insert or update or delete on public.assignments
  for each row execute function private.assignments_history();

-- 지금 담당 연결을 끝난 날 없는 이력으로 옮긴다. 이미 지워진 옛 담당은 복구할 수 없다
insert into public.assignment_history (org_id, resident_id, worker_id, start_date, visit_days, created_at)
select a.org_id, a.resident_id, a.worker_id, a.start_date, a.visit_days, a.created_at
from public.assignments a;

comment on table public.assignment_history is
  '담당 이력(이슈 #380). assignments 트리거만 씀. 같은 기관 관리자·강사만 읽음';
