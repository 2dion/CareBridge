-- 못 쓴 기록: 방문 요일·담당 시작일, 하루 1건, 한국 날짜, 기록 없음 처리, 못 쓴 기록 계산
-- 근거: 문서/설계/데이터구조-v1.5.md ('assignments', 'records', 'no_care_days', '못 쓴 기록',
--       '권한 규칙', '공통 계약 > 기록 만들기'), 문서/결정/2026-10-25-못쓴기록.md
--
-- '오늘'은 모두 (now() at time zone 'Asia/Seoul')::date. current_date는 UTC라 오전 9시 전에는 어제가 됨.
--
-- 새 오류 키 (서버 API·화면이 Supabase 오류의 message로 받음)
--   care_date_out_of_range  돌봄 날짜가 오늘(한국)보다 뒤이거나 7일 전보다 앞
--   record_exists           그날 기록이 이미 있어 [이 날 기록 없음]을 남길 수 없음
--   no_care_day_exists      그 어르신 그날 [이 날 기록 없음]이 있어 기록을 만들 수 없음
-- 만든 기록의 care_date를 바꾸면 invalid_transition으로 거절됩니다.
-- 같은 날 두 번째 기록은 unique 위반(code 23505, constraint records_one_per_day)으로 거절됩니다.

-- ─────────────────────────────────────────────────────────
-- 1. assignments: 방문 요일, 담당 시작일
-- ─────────────────────────────────────────────────────────

alter table public.assignments
  -- 1(월)~7(일). 재가만 씀, 시설은 비움(매일)
  add column visit_days smallint[] check (visit_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  add column start_date date not null default (now() at time zone 'Asia/Seoul')::date;

-- ─────────────────────────────────────────────────────────
-- 2. records: 하루 1건, 한국 날짜, 오늘~7일 전, 기록 없음 처리한 날 막기, 날짜 고정
-- ─────────────────────────────────────────────────────────

alter table public.records
  alter column care_date set default (now() at time zone 'Asia/Seoul')::date,
  add constraint records_one_per_day unique (worker_id, resident_id, care_date);

-- 기록 없음 처리한 날에는 기록을 만들지 않음 (팀장 결정 10/25). 실제로 돌봄이 있었으면
-- 담당자가 처리를 지운 뒤 씀. 작성자가 못 읽는 no_care_days도 보도록 security definer
create function private.records_check_care_date() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.care_date > (now() at time zone 'Asia/Seoul')::date
     or new.care_date < (now() at time zone 'Asia/Seoul')::date - 7 then
    raise exception 'care_date_out_of_range';
  end if;
  if exists (
    select 1 from public.no_care_days
    where resident_id = new.resident_id and care_date = new.care_date
  ) then
    raise exception 'no_care_day_exists';
  end if;
  return new;
end $$;

create trigger records_check_care_date before insert on public.records
  for each row execute function private.records_check_care_date();

-- 만든 뒤 care_date를 바꾸지 않음: init의 상태 변화 검사에 care_date를 더함 (service_role도 막힘)
create or replace function private.records_before_update() returns trigger
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
     or new.worker_id <> old.worker_id or new.form_type <> old.form_type
     or new.care_date <> old.care_date then
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

-- ─────────────────────────────────────────────────────────
-- 3. no_care_days: 돌봄이 없던 날과 사유
-- ─────────────────────────────────────────────────────────

create table public.no_care_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id), -- 트리거가 어르신의 기관으로 채움
  resident_id uuid not null references public.residents (id) on delete cascade,
  care_date date not null,
  reason text not null check (reason in ('hospital', 'overnight', 'visit_cancelled', 'other')),
  note text not null default '', -- 기타일 때 필수
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (resident_id, care_date), -- 어르신 단위라 담당 작성자가 여럿이어도 한 번만
  constraint no_care_days_note_needed check (reason <> 'other' or trim(note) <> '')
);

-- 기관은 어르신에서, 날짜는 오늘~7일 전, 그날 기록(임시 저장 포함)이 있으면 못 남김
create function private.no_care_days_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select org_id into new.org_id from public.residents where id = new.resident_id;
  if new.care_date > (now() at time zone 'Asia/Seoul')::date
     or new.care_date < (now() at time zone 'Asia/Seoul')::date - 7 then
    raise exception 'care_date_out_of_range';
  end if;
  if exists (
    select 1 from public.records
    where resident_id = new.resident_id and care_date = new.care_date
  ) then
    raise exception 'record_exists';
  end if;
  return new;
end $$;

create trigger no_care_days_before_insert before insert on public.no_care_days
  for each row execute function private.no_care_days_before_insert();

-- ─────────────────────────────────────────────────────────
-- 4. 표 권한(GRANT)
-- ─────────────────────────────────────────────────────────

-- care_date는 만든 뒤 바꾸지 않음
revoke update (care_date) on public.records from authenticated;

revoke all on public.no_care_days from anon, authenticated;
grant select, delete on public.no_care_days to authenticated;
grant insert (resident_id, care_date, reason, note) on public.no_care_days to authenticated;

-- ─────────────────────────────────────────────────────────
-- 5. RLS (데이터 구조 v1.5 '권한 규칙' 표)
-- ─────────────────────────────────────────────────────────

alter table public.no_care_days enable row level security;

-- 작성자는 내 담당 어르신 것 읽기·만들기, 담당자·강사는 같은 기관 전체 읽기·만들기·지우기
create policy no_care_days_select on public.no_care_days for select to authenticated
  using (
    org_id = private.my_org_id()
    and (
      private.is_reviewer()
      or exists (
        select 1 from public.assignments a
        where a.resident_id = no_care_days.resident_id and a.worker_id = auth.uid()
      )
    )
  );
create policy no_care_days_insert on public.no_care_days for insert to authenticated
  with check (
    created_by = auth.uid()
    and org_id = private.my_org_id()
    and (
      private.is_reviewer()
      or exists (
        select 1 from public.assignments a
        where a.resident_id = no_care_days.resident_id and a.worker_id = auth.uid()
      )
    )
  );
create policy no_care_days_reviewer_delete on public.no_care_days for delete to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer());

-- ─────────────────────────────────────────────────────────
-- 6. 못 쓴 기록 계산 (화면이 supabase.rpc('list_missed_records')로 부름)
-- ─────────────────────────────────────────────────────────

-- 지난 p_days일(어제부터, 오늘은 뺌) 중 기록이 있어야 하는 날에 기록이 없거나(missing)
-- draft에 머문 것(draft). 부른 사람의 RLS로 돌아 작성자는 자기 것만, 담당자·강사는 같은 기관 전체.
-- p_days는 1~7로 묶음 (큰 값으로 날짜 줄을 많이 만들지 않게)
create function public.list_missed_records(p_days int default 7)
returns table (
  worker_id uuid, resident_id uuid, care_date date, kind text, record_id uuid
)
language sql stable security invoker set search_path = ''
as $$
  with days as (
    select ((now() at time zone 'Asia/Seoul')::date - n)::date as d
    from generate_series(1, least(greatest(p_days, 1), 7)) as n
  )
  select a.worker_id, a.resident_id, days.d,
         case when rec.id is null then 'missing' else 'draft' end,
         rec.id
  from public.assignments a
  join public.residents r on r.id = a.resident_id
  join days on days.d >= a.start_date
  left join public.records rec
    on rec.worker_id = a.worker_id and rec.resident_id = a.resident_id and rec.care_date = days.d
  where (
      r.care_type = 'facility'
      or (r.care_type = 'home' and extract(isodow from days.d)::smallint = any (a.visit_days))
    )
    and not exists (
      select 1 from public.no_care_days n
      where n.resident_id = a.resident_id and n.care_date = days.d
    )
    and (rec.id is null or rec.status = 'draft')
  order by days.d desc, a.worker_id, a.resident_id
$$;

revoke execute on function public.list_missed_records(int) from public, anon;
grant execute on function public.list_missed_records(int) to authenticated, service_role;
