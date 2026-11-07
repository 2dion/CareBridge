-- 이슈 #379·#380: 이전 담당 어르신의 기록이 상태와 상관없이 숨는지, 남은 기록·빈 날이 있으면 담당을 끊지 못하는지,
-- 담당 이력이 쌓이는지 검사한다. 적용된 DB에서 실행하고, 합성 픽스처는 마지막 ROLLBACK으로 지운다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
-- 담당 끊기가 거절되는지(오류 키·건수) 본다
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

insert into public.organizations(id,name) values
 ('f1000000-0000-0000-0000-000000000011','검증 기관 가'),
 ('f1000000-0000-0000-0000-000000000012','검증 기관 나');
insert into auth.users(id) values
 ('f2000000-0000-0000-0000-000000000011'),('f2000000-0000-0000-0000-000000000012'),
 ('f2000000-0000-0000-0000-000000000013');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('f2000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-000000000011','worker','가상 작성자 갑','vi'),
 ('f2000000-0000-0000-0000-000000000012','f1000000-0000-0000-0000-000000000011','reviewer','가상 관리자 갑','ko'),
 ('f2000000-0000-0000-0000-000000000013','f1000000-0000-0000-0000-000000000012','reviewer','가상 관리자 을','ko');
-- 어르신 1(시설, 남은 일 있음)·어르신 2(재가, 방문 요일 없음 → 빈 날 없음)·어르신 3(시설, 오늘 시작 → 빈 날 없음)
insert into public.residents(id,org_id,name,care_type) values
 ('f3000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-000000000011','합성 어르신 하나','facility'),
 ('f3000000-0000-0000-0000-000000000012','f1000000-0000-0000-0000-000000000011','합성 어르신 둘','home'),
 ('f3000000-0000-0000-0000-000000000013','f1000000-0000-0000-0000-000000000011','합성 어르신 셋','facility');
insert into public.assignments(worker_id,resident_id,start_date,visit_days) values
 ('f2000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000011',(now() at time zone 'Asia/Seoul')::date - 3,null),
 ('f2000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000012',(now() at time zone 'Asia/Seoul')::date - 3,array[]::smallint[]),
 ('f2000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000013',(now() at time zone 'Asia/Seoul')::date,null);

-- 1. 담당 이력: 연결 3개가 끝난 날 없이 쌓임
select pg_temp.check_true((select count(*)=3 from public.assignment_history where worker_id='f2000000-0000-0000-0000-000000000011' and end_date is null),'연결하면 이력이 생김');

-- 어르신 1: 3일 전 submitted, 2일 전 draft, 1일 전 비어 있음
alter table public.records disable trigger user;
insert into public.records(id,org_id,resident_id,worker_id,care_date,form_type,status,native_lang) values
 ('f4000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000011','f2000000-0000-0000-0000-000000000011',(now() at time zone 'Asia/Seoul')::date - 3,16,'submitted','vi'),
 ('f4000000-0000-0000-0000-000000000012','f1000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000011','f2000000-0000-0000-0000-000000000011',(now() at time zone 'Asia/Seoul')::date - 2,16,'draft','vi');
alter table public.records enable trigger user;

-- 2. 남은 일이 있으면 끊기 거절(기록 2건, 빈 날 1일)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
select pg_temp.check_true(
  (select pg_temp.delete_error('f2000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000011')
   = 'assignment_open_work {"open_records" : 2, "empty_days" : 1}'),
  '남은 기록 2건·빈 날 1일이면 끊기 거절');
reset role;

-- 3. 정리: submitted·draft를 approved로, 빈 날은 관리자가 기록 없음 처리
alter table public.records disable trigger user;
update public.records set status='approved' where id in ('f4000000-0000-0000-0000-000000000011','f4000000-0000-0000-0000-000000000012');
alter table public.records enable trigger user;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
select pg_temp.check_true(
  (select pg_temp.delete_error('f2000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000011')
   = 'assignment_open_work {"open_records" : 0, "empty_days" : 1}'),
  '빈 날만 남아도 끊기 거절');
insert into public.no_care_days(resident_id,care_date,reason) values
 ('f3000000-0000-0000-0000-000000000011',(now() at time zone 'Asia/Seoul')::date - 1,'hospital');
select pg_temp.check_true(
  (select pg_temp.delete_error('f2000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000011') = 'ok'),
  '정리하면 끊기 됨');
-- 4. 방문 요일 없는 재가·오늘 시작한 시설은 빈 날이 없어 바로 끊김
select pg_temp.check_true(
  (select pg_temp.delete_error('f2000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000012') = 'ok'),
  '방문 요일 없는 재가는 끊기 됨');
-- 5. 관리자: 이력에 끝난 날·끊은 관리자
select pg_temp.check_true((select end_date=(now() at time zone 'Asia/Seoul')::date and ended_by='f2000000-0000-0000-0000-000000000012'
  from public.assignment_history where resident_id='f3000000-0000-0000-0000-000000000011'),'이력에 끝난 날·끊은 관리자');
select pg_temp.check_true((select count(*)=3 from public.assignment_history where worker_id='f2000000-0000-0000-0000-000000000011'),'관리자는 이력을 읽음');
-- 다른 기관 관리자는 못 읽음
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000013","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=0 from public.assignment_history),'다른 기관은 이력을 못 읽음');

-- 6. 작성자: 이전 담당 어르신의 기록은 상태와 상관없이 숨고, 이력도 못 읽음
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=0 from public.records where resident_id='f3000000-0000-0000-0000-000000000011'),'이전 담당 어르신 기록은 숨음');
select pg_temp.check_true((select count(*)=0 from public.assignment_history),'작성자는 이력을 못 읽음');
reset role;

-- 7. 남은 draft가 있는데 담당 행이 없는 옛 데이터: submit_own_record는 보내지 않음
alter table public.records disable trigger user;
update public.records set status='draft' where id='f4000000-0000-0000-0000-000000000012';
alter table public.records enable trigger user;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=0 from public.submit_own_record('f4000000-0000-0000-0000-000000000012','draft')),'담당이 아니면 보내지 않음');
reset role;

-- 8. 다시 연결하면 다시 보이고 이력 새 줄이 생김
insert into public.assignments(worker_id,resident_id,start_date) values
 ('f2000000-0000-0000-0000-000000000011','f3000000-0000-0000-0000-000000000011',(now() at time zone 'Asia/Seoul')::date);
select pg_temp.check_true((select count(*)=2 from public.assignment_history where resident_id='f3000000-0000-0000-0000-000000000011'),'다시 연결하면 이력 새 줄');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=2 from public.records where resident_id='f3000000-0000-0000-0000-000000000011'),'다시 연결하면 다시 보임');
select pg_temp.check_true((select count(*)=1 from public.submit_own_record('f4000000-0000-0000-0000-000000000012','draft')),'담당이면 보냄');
reset role;

-- 9. 시작일 바꾸기는 열린 이력 줄을 고침
update public.assignments set start_date=(now() at time zone 'Asia/Seoul')::date - 1
 where worker_id='f2000000-0000-0000-0000-000000000011' and resident_id='f3000000-0000-0000-0000-000000000013';
select pg_temp.check_true((select start_date=(now() at time zone 'Asia/Seoul')::date - 1 from public.assignment_history
  where resident_id='f3000000-0000-0000-0000-000000000013' and end_date is null),'시작일 바꾸면 이력도 바뀜');

-- 10. 어르신 삭제에 딸린 담당 삭제는 검사하지 않음(어르신 3: 빈 날 1일이 생겼지만 기록이 없어 지울 수 있음)
delete from public.residents where id='f3000000-0000-0000-0000-000000000013';
select pg_temp.check_true((select count(*)=0 from public.assignments where resident_id='f3000000-0000-0000-0000-000000000013'),'어르신 삭제에 딸린 담당 삭제는 됨');

select 'assignment-end-check-history: all assertions passed' as result;
rollback;
