-- 못 쓴 기록: 임시 저장(draft)은 날짜 제한 없이, 기록 없음(missing)만 지난 7일
-- 근거: 문서/결정/2026-10-26-기록함기간.md 결정 5·'영향 → 서버', 문서/설계/데이터구조-v1.6.md '못 쓴 기록'
--
-- 함수 이름·입출력은 그대로. p_days 는 missing 에만 씀(1~7로 묶음).
-- 보내지 않은 임시 저장은 오늘을 뺀 지난 날이면 날짜와 상관없이 보낼 때까지 나옴.

create or replace function public.list_missed_records(p_days int default 7)
returns table (
  worker_id uuid, resident_id uuid, care_date date, kind text, record_id uuid
)
language sql stable security invoker set search_path = ''
as $$
  with days as (
    select ((now() at time zone 'Asia/Seoul')::date - n)::date as d
    from generate_series(1, least(greatest(p_days, 1), 7)) as n
  ),
  missing as (
    -- 지난 7일 중 기록이 있어야 하는 날인데 그 작성자의 기록이 없는 날
    select a.worker_id, a.resident_id, days.d as care_date
    from public.assignments a
    join public.residents r on r.id = a.resident_id
    join days on days.d >= a.start_date
    where (
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
  )
  select m.worker_id, m.resident_id, m.care_date, 'missing', null::uuid
  from missing m
  union all
  -- 보내지 않은 임시 저장 (날짜 제한 없음, 오늘은 뺌)
  select rec.worker_id, rec.resident_id, rec.care_date, 'draft', rec.id
  from public.records rec
  where rec.status = 'draft'
    and rec.care_date < (now() at time zone 'Asia/Seoul')::date
  order by 3 desc, 1, 2
$$;
