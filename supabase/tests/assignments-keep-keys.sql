-- 이슈 #394 2번: 담당 연결의 작성자·어르신·기관 칸은 만든 뒤 바꾸지 못하고(assignment_key_locked), 시작일·방문 요일·표시 시간은 바꿀 수 있는지 검사한다.
-- 적용된 DB에서 실행하고, 합성 픽스처는 마지막 ROLLBACK으로 지운다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.update_error(statement text) returns text
language plpgsql as $$
begin
  execute statement;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

insert into public.organizations(id,name) values ('a1000000-0000-0000-0000-000000000021','검증 기관 가');
insert into auth.users(id) values ('a2000000-0000-0000-0000-000000000021'),('a2000000-0000-0000-0000-000000000022');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('a2000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000021','worker','가상 작성자 갑','vi'),
 ('a2000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000021','worker','가상 작성자 을','vi');
insert into public.residents(id,org_id,name,care_type) values
 ('a3000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000021','합성 어르신 하나','facility'),
 ('a3000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000021','합성 어르신 둘','facility');
insert into public.assignments(worker_id,resident_id,start_date,visit_days,schedule) values
 ('a2000000-0000-0000-0000-000000000021','a3000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date,null,'');

-- 바꿀 수 있는 칸: 시작일·방문 요일·표시 시간
select pg_temp.check_true(pg_temp.update_error(
  $q$update public.assignments set start_date = start_date - 1, visit_days = array[1,3]::smallint[], schedule = '오전' where worker_id = 'a2000000-0000-0000-0000-000000000021'$q$
) = 'ok', 'start_date·visit_days·schedule can change');
select pg_temp.check_true((select schedule = '오전' and visit_days = array[1,3]::smallint[] from public.assignments where worker_id = 'a2000000-0000-0000-0000-000000000021'), 'changed values saved');

-- 바꿀 수 없는 칸: 작성자·어르신(지우고 다시 넣어야 끊기 전 검사·이력이 돈다)
select pg_temp.check_true(pg_temp.update_error(
  $q$update public.assignments set worker_id = 'a2000000-0000-0000-0000-000000000022' where worker_id = 'a2000000-0000-0000-0000-000000000021'$q$
) like '%assignment_key_locked%', 'worker_id locked');
select pg_temp.check_true(pg_temp.update_error(
  $q$update public.assignments set resident_id = 'a3000000-0000-0000-0000-000000000022' where worker_id = 'a2000000-0000-0000-0000-000000000021'$q$
) like '%assignment_key_locked%', 'resident_id locked');
-- 같은 값으로 다시 쓰는 것(PostgREST upsert가 보낸 칸을 모두 set에 넣음)은 막지 않는다
select pg_temp.check_true(pg_temp.update_error(
  $q$update public.assignments set worker_id = worker_id, resident_id = resident_id, schedule = '오후' where worker_id = 'a2000000-0000-0000-0000-000000000021'$q$
) = 'ok', 'same key values allowed (upsert path)');
-- 담당 이력은 처음 짝 그대로 하나만 열려 있다
select pg_temp.check_true((select count(*) = 1 from public.assignment_history where worker_id = 'a2000000-0000-0000-0000-000000000021' and resident_id = 'a3000000-0000-0000-0000-000000000021' and end_date is null), 'history still matches the original pair');

select 'assignments-keep-keys: all assertions passed' as result;
rollback;
