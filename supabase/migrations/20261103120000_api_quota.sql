-- AI를 부르는 API의 사용자별 호출 제한(이슈 #256). 한 계정의 반복 호출이 기관 공용 월 토큰을 다 쓰지 않게 한다.
-- 근거: 문서/결정/2026-11-03-ai호출제한.md, 문서/설계/데이터구조-v2.3.6.md 'api_usage'
-- 서버(service_role)만 take_api_quota로 세고 넣는다. 사용자는 읽지도 쓰지도 못한다.

create table public.api_usage (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('agent', 'audio', 'item', 'helper', 'translate')),
  created_at timestamptz not null default now()
);
create index api_usage_user_kind_idx on public.api_usage (user_id, kind, created_at desc);

alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;
-- 정책을 두지 않는다: 로그인 사용자는 이 표를 볼 수 없다(서버 전용)

-- 한도 안이면 한 번을 쓰고 true, 넘었으면 false. 같은 사람·종류는 잠금으로 차례대로 센다.
create function public.take_api_quota(p_user_id uuid, p_kind text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql set search_path = ''
as $$
declare
  me_org uuid;
  used int;
begin
  select org_id into me_org from public.profiles where id = p_user_id;
  if me_org is null then
    return true; -- 프로필이 없으면 각 API가 거절한다
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_kind));
  delete from public.api_usage where user_id = p_user_id and created_at < now() - interval '1 day';
  select count(*) into used from public.api_usage
    where user_id = p_user_id and kind = p_kind
      and created_at > now() - make_interval(secs => p_window_seconds);
  if used >= p_limit then
    return false;
  end if;
  insert into public.api_usage (org_id, user_id, kind) values (me_org, p_user_id, p_kind);
  return true;
end $$;

revoke all on function public.take_api_quota(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.take_api_quota(uuid, text, int, int) to service_role;
