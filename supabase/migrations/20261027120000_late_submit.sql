-- 늦게 보낸 기록: 처음 보낸 한국 날짜와 care_date로 계산 (칸 추가 없음)
-- 근거: 문서/결정/2026-10-27-늦게보낸기록계산.md, 문서/결정/2026-10-26-기록함기간.md 결정 6,
--       문서/설계/데이터구조-v1.6.md records '늦게 보낸 기록'·공통 계약
--
-- 화면(R2·R3)은 supabase.rpc('record_late_submit', { p_record_id })로 부름.
-- late_days ≥ 1 이면 '늦게 보낸 기록(n일 뒤)'. 되돌린 뒤 다시 보낸 날은 보지 않음. 승인은 막지 않음.

create function public.record_late_submit(p_record_id uuid)
returns table (
  record_id uuid, care_date date, first_submitted_on date, late_days int
)
language sql stable security invoker set search_path = ''
as $$
  select rec.id, rec.care_date, first.d,
         case when first.d is null then null else greatest(first.d - rec.care_date, 0) end
  from public.records rec
  left join lateral (
    select (min(e.created_at) at time zone 'Asia/Seoul')::date as d
    from public.record_events e
    where e.record_id = rec.id and e.type = 'submitted'
  ) first on true
  where rec.id = p_record_id
$$;

revoke execute on function public.record_late_submit(uuid) from public, anon;
grant execute on function public.record_late_submit(uuid) to authenticated, service_role;
