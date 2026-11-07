-- 이슈 #391: 한 어르신에 작성자가 둘일 때, 한 작성자만 쓴 날은 다른 작성자의 빈 날로 세지 않아 담당을 끊을 수 있는지 검사한다.
-- 아무도 쓰지 않은 날은 지금처럼 빈 날로 남는지도 본다. 적용된 DB에서 실행하고, 합성 픽스처는 마지막 ROLLBACK으로 지운다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.delete_error(p_worker uuid, p_resident uuid) returns text
language plpgsql as $$
declare d text;
begin
  delete from public.assignments where worker_id = p_worker and resident_id = p_resident;
  return 'ok';
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return sqlerrm || ' ' || coalesce(d, '');
end $$;

insert into public.organizations(id,name) values ('f1000000-0000-0000-0000-000000000021','검증 기관 다');
insert into auth.users(id) values
 ('f2000000-0000-0000-0000-000000000021'),('f2000000-0000-0000-0000-000000000022'),
 ('f2000000-0000-0000-0000-000000000023');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('f2000000-0000-0000-0000-000000000021','f1000000-0000-0000-0000-000000000021','worker','가상 작성자 갑','vi'),
 ('f2000000-0000-0000-0000-000000000022','f1000000-0000-0000-0000-000000000021','worker','가상 작성자 을','vi'),
 ('f2000000-0000-0000-0000-000000000023','f1000000-0000-0000-0000-000000000021','reviewer','가상 관리자 병','ko');
insert into public.residents(id,org_id,name,care_type) values
 ('f3000000-0000-0000-0000-000000000021','f1000000-0000-0000-0000-000000000021','합성 어르신 넷','facility');
-- 두 작성자가 같은 어르신을 2일 전부터 담당
insert into public.assignments(worker_id,resident_id,start_date) values
 ('f2000000-0000-0000-0000-000000000021','f3000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date - 2),
 ('f2000000-0000-0000-0000-000000000022','f3000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date - 2);

-- 2일 전: 갑만 기록(승인 완료). 1일 전: 아무도 쓰지 않음
alter table public.records disable trigger user;
insert into public.records(id,org_id,resident_id,worker_id,care_date,form_type,status,native_lang) values
 ('f4000000-0000-0000-0000-000000000021','f1000000-0000-0000-0000-000000000021','f3000000-0000-0000-0000-000000000021','f2000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date - 2,16,'approved','vi');
alter table public.records enable trigger user;

-- 1. 을의 빈 날은 1일 전 하루뿐(갑이 쓴 2일 전은 세지 않음)
select pg_temp.check_true(
  (select empty_days = 1 and open_records = 0 from private.assignment_open_work(
     'f2000000-0000-0000-0000-000000000022','f3000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date - 2, null)),
  '다른 작성자가 쓴 날은 빈 날이 아님');

-- 2. 아무도 쓰지 않은 1일 전이 남아 있으면 지금처럼 끊기 거절
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000023","role":"authenticated"}',true);
select pg_temp.check_true(
  (select pg_temp.delete_error('f2000000-0000-0000-0000-000000000022','f3000000-0000-0000-0000-000000000021')
   = 'assignment_open_work {"open_records" : 0, "empty_days" : 1}'),
  '아무도 쓰지 않은 날이 남으면 끊기 거절');

-- 3. 관리자가 1일 전을 기록 없음으로 정리하면 을의 담당을 끊을 수 있음(2일 전은 갑의 기록이 있어 정리할 필요 없음)
insert into public.no_care_days(resident_id,care_date,reason) values
 ('f3000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date - 1,'hospital');
select pg_temp.check_true(
  (select pg_temp.delete_error('f2000000-0000-0000-0000-000000000022','f3000000-0000-0000-0000-000000000021') = 'ok'),
  '다른 작성자만 쓴 날이 있어도 정리 뒤 끊기 됨');
reset role;

-- 4. 끝나지 않은 기록은 지금처럼 그 작성자 것만 센다: 을의 draft가 있으면 을은 거절, 갑은 상관없음
insert into public.assignments(worker_id,resident_id,start_date) values
 ('f2000000-0000-0000-0000-000000000022','f3000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date);
alter table public.records disable trigger user;
insert into public.records(id,org_id,resident_id,worker_id,care_date,form_type,status,native_lang) values
 ('f4000000-0000-0000-0000-000000000022','f1000000-0000-0000-0000-000000000021','f3000000-0000-0000-0000-000000000021','f2000000-0000-0000-0000-000000000022',(now() at time zone 'Asia/Seoul')::date - 1,16,'draft','vi');
alter table public.records enable trigger user;
select pg_temp.check_true(
  (select open_records = 1 from private.assignment_open_work(
     'f2000000-0000-0000-0000-000000000022','f3000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date, null)),
  '을의 끝나지 않은 기록은 을에게 셈');
select pg_temp.check_true(
  (select open_records = 0 from private.assignment_open_work(
     'f2000000-0000-0000-0000-000000000021','f3000000-0000-0000-0000-000000000021',(now() at time zone 'Asia/Seoul')::date - 2, null)),
  '다른 작성자의 끝나지 않은 기록은 세지 않음');

select 'assignment-open-work-two-workers: all assertions passed' as result;
rollback;
