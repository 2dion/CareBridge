-- 이슈 #391: 한 어르신에 작성자가 둘 이상이면, 한 작성자만 쓴 날 때문에 다른 작성자의 담당을 끊지 못했다.
-- 근거: 문서/결정/2026-11-07-담당끊기빈날기준.md, 문서/설계/데이터구조-v2.3.11.md 'assignments' 담당 끊기
--
-- 담당 끊기 전 검사의 '빈 날'을 어르신 기준으로 센다: 그날 그 어르신에 누구의 기록도 없고 기록 없음(no_care_days)도 없는 날.
-- 기록 없음 처리(no_care_days)가 어르신 단위이고 그날 기록이 하나라도 있으면 record_exists로 거절하므로,
-- 작성자 기준으로 세면 다른 작성자가 쓴 날은 쓸 수도(7일 지남) 정리할 수도 없어 30일 동안 담당을 끊지 못했다.
-- 끝나지 않은 기록(draft·submitted·returned)은 지금처럼 그 작성자 것만 센다.
-- 못 쓴 기록(list_missed_records)·기한 지난 빈 기록(list_overdue_records)은 작성자별 알림이라 그대로 둔다.
-- 코디세이 DB(fffgpgrnppxxqccncstf)에만 적용한다. 공모전 DB(CareBridge)에는 적용하지 않는다.

create or replace function private.assignment_open_work(p_worker_id uuid, p_resident_id uuid, p_start date, p_visit_days smallint[])
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
        -- 작성자 상관없이 그날 그 어르신의 기록이 있으면 빈 날이 아니다(#391)
        and not exists (
          select 1 from public.records rec
          where rec.resident_id = p_resident_id and rec.care_date = days.d
        ))
$$;
revoke execute on function private.assignment_open_work(uuid, uuid, date, smallint[]) from public, anon, authenticated;
