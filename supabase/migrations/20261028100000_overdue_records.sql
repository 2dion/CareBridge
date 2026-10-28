-- 기한 지난 빈 기록: 8~30일 전 빈 날을 담당자 R1에 보이고, 담당자가 기록 없음으로 정리
-- 근거: 문서/결정/2026-10-28-기한지난빈기록.md, 문서/설계/데이터구조-v1.6.2.md '못 쓴 기록'
--
-- list_missed_records(지난 7일)는 그대로 둔다. 작성자는 지금처럼 7일 안에서만 쓰고 기록 없음을 남긴다.

-- ─────────────────────────────────────────────────────────
-- 1. no_care_days: 담당자·강사는 30일 전까지 남길 수 있음
-- ─────────────────────────────────────────────────────────

create or replace function private.no_care_days_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  oldest int := case when private.is_reviewer() then 30 else 7 end;
begin
  select org_id into new.org_id from public.residents where id = new.resident_id;
  if new.care_date > today or new.care_date < today - oldest then
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

-- ─────────────────────────────────────────────────────────
-- 2. 기한 지난 빈 기록 계산 (R1이 supabase.rpc('list_overdue_records')로 부름)
-- ─────────────────────────────────────────────────────────

-- 8~30일 전 중 기록이 있어야 하는 날인데 그 작성자의 기록도 기록 없음 처리도 없는 날.
-- 담당자·강사만 받음(작성자는 이미 쓸 수 없는 날이라 알리지 않음). RLS로 같은 기관만.
create function public.list_overdue_records()
returns table (worker_id uuid, resident_id uuid, care_date date)
language sql stable security invoker set search_path = ''
as $$
  with days as (
    select ((now() at time zone 'Asia/Seoul')::date - n)::date as d
    from generate_series(8, 30) as n
  )
  select a.worker_id, a.resident_id, days.d
  from public.assignments a
  join public.residents r on r.id = a.resident_id
  join days on days.d >= a.start_date
  where private.is_reviewer()
    and (
      r.care_type = 'facility'
      or (r.care_type = 'home' and extract(isodow from days.d)::smallint = any (a.visit_days))
    )
    and not exists (
      select 1 from public.no_care_days n
      where n.resident_id = a.resident_id and n.care_date = days.d
    )
    and not exists (
      select 1 from public.records rec
      where rec.worker_id = a.worker_id and rec.resident_id = a.resident_id and rec.care_date = days.d
    )
  order by 3 desc, 1, 2
$$;

revoke execute on function public.list_overdue_records() from public, anon;
grant execute on function public.list_overdue_records() to authenticated, service_role;
