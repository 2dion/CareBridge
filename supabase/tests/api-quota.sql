-- 이슈 #256: api_usage·take_api_quota 권한과 세기. 적용된 DB에서 실행하고, 합성 픽스처는 마지막 ROLLBACK으로 지운다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;

-- 권한: RLS 켬, anon·authenticated는 표와 함수 모두 못 씀, service_role만 실행
select pg_temp.check_true((select relrowsecurity from pg_class where oid = 'public.api_usage'::regclass), 'rls on');
select pg_temp.check_true((select count(*) = 0 from pg_policies where tablename = 'api_usage'), 'no policies');
select pg_temp.check_true(not has_table_privilege('anon', 'public.api_usage', 'select,insert,update,delete'), 'anon table');
select pg_temp.check_true(not has_table_privilege('authenticated', 'public.api_usage', 'select,insert,update,delete'), 'authenticated table');
select pg_temp.check_true(not has_function_privilege('anon', 'public.take_api_quota(uuid,text,int,int)', 'execute'), 'anon fn');
select pg_temp.check_true(not has_function_privilege('authenticated', 'public.take_api_quota(uuid,text,int,int)', 'execute'), 'authenticated fn');
select pg_temp.check_true(has_function_privilege('service_role', 'public.take_api_quota(uuid,text,int,int)', 'execute'), 'service_role fn');

insert into public.organizations(id, name) values ('a1000000-0000-0000-0000-000000000001', '검증 기관 쿼터');
insert into auth.users(id) values ('a2000000-0000-0000-0000-000000000001');
insert into public.profiles(id, org_id, role, name, native_lang) values
 ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'worker', '가상 작성자 쿼터', 'vi');

-- 로그인 사용자가 직접 부르면 거절
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  perform public.take_api_quota('a2000000-0000-0000-0000-000000000001', 'agent', 99, 3600);
  raise exception 'FAIL: authenticated could call take_api_quota';
exception when insufficient_privilege then null;
end $$;
reset role;

set local role service_role;
select pg_temp.check_true(public.take_api_quota('a2000000-0000-0000-0000-000000000001', 'agent', 2, 3600), 'first');
select pg_temp.check_true(public.take_api_quota('a2000000-0000-0000-0000-000000000001', 'agent', 2, 3600), 'second');
select pg_temp.check_true(not public.take_api_quota('a2000000-0000-0000-0000-000000000001', 'agent', 2, 3600), 'third blocked');
select pg_temp.check_true(public.take_api_quota('a2000000-0000-0000-0000-000000000001', 'helper', 2, 3600), 'other kind');
-- translate 종류(항목 다시 번역, 되돌린 사유 번역)도 kind 검사를 통과하고 따로 센다
select pg_temp.check_true(public.take_api_quota('a2000000-0000-0000-0000-000000000001', 'translate', 1, 3600), 'translate first');
select pg_temp.check_true(not public.take_api_quota('a2000000-0000-0000-0000-000000000001', 'translate', 1, 3600), 'translate blocked');
-- 프로필 없는 id는 세지 않고 통과
select pg_temp.check_true(public.take_api_quota('a2000000-0000-0000-0000-00000000ffff', 'agent', 0, 3600), 'no profile');
reset role;
select pg_temp.check_true((select count(*) = 4 from public.api_usage where user_id = 'a2000000-0000-0000-0000-000000000001'), 'rows');
select pg_temp.check_true((select bool_and(org_id = 'a1000000-0000-0000-0000-000000000001') from public.api_usage
  where user_id = 'a2000000-0000-0000-0000-000000000001'), 'org_id from profile');

-- 시간 창 밖은 세지 않고, 하루 지난 줄은 지운다
update public.api_usage set created_at = now() - interval '2 hours'
  where user_id = 'a2000000-0000-0000-0000-000000000001' and kind = 'agent';
insert into public.api_usage(org_id, user_id, kind, created_at) values
 ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'agent', now() - interval '2 days');
set local role service_role;
select pg_temp.check_true(public.take_api_quota('a2000000-0000-0000-0000-000000000001', 'agent', 1, 3600), 'window reset');
reset role;
select pg_temp.check_true((select count(*) = 0 from public.api_usage where created_at < now() - interval '1 day'), 'old deleted');

select 'api-quota: all assertions passed' as result;
rollback;
