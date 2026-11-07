-- 이슈 #367: 담당이 끝난 작성자에게 끝난 기록(submitted·approved)이 숨고 draft·returned는 남는지 검사한다.
-- 적용된 DB에서 실행하고, 합성 픽스처는 마지막 ROLLBACK으로 지운다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;

insert into public.organizations(id,name) values
 ('f1000000-0000-0000-0000-000000000001','검증 기관 가'),
 ('f1000000-0000-0000-0000-000000000002','검증 기관 나');
insert into auth.users(id) values
 ('f2000000-0000-0000-0000-000000000001'),('f2000000-0000-0000-0000-000000000002'),
 ('f2000000-0000-0000-0000-000000000003'),('f2000000-0000-0000-0000-000000000004');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','worker','가상 작성자 갑','vi'),
 ('f2000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','reviewer','가상 관리자 갑','ko'),
 ('f2000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000001','worker','가상 작성자 을','vi'),
 ('f2000000-0000-0000-0000-000000000004','f1000000-0000-0000-0000-000000000002','reviewer','가상 관리자 을','ko');
-- 어르신 1(담당 유지)·어르신 2(담당이 끝날 어르신)
insert into public.residents(id,org_id,name,care_type) values
 ('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','합성 어르신 하나','facility'),
 ('f3000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','합성 어르신 둘','facility');
insert into public.assignments(worker_id,resident_id) values
 ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001'),
 ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002');

-- 상태가 다른 기록을 바로 만든다(상태 검사 트리거는 이 검사의 대상이 아니라 잠시 끈다)
alter table public.records disable trigger user;
insert into public.records(id,org_id,resident_id,worker_id,care_date,form_type,status,native_lang) values
 ('f4000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','2026-11-01',16,'submitted','vi'),
 ('f4000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','2026-11-01',16,'submitted','vi'),
 ('f4000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','2026-11-02',16,'approved','vi'),
 ('f4000000-0000-0000-0000-000000000004','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','2026-11-03',16,'approved','vi'),
 ('f4000000-0000-0000-0000-000000000005','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','2026-11-04',16,'draft','vi'),
 ('f4000000-0000-0000-0000-000000000006','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','2026-11-05',16,'returned','vi'),
 ('f4000000-0000-0000-0000-000000000007','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000003','2026-11-01',16,'submitted','vi');
alter table public.records enable trigger user;
-- 항목은 승인 기록(3)과 draft(5)에만 직접 넣는다
alter table public.record_items disable trigger user;
insert into public.record_items(org_id,record_id,item_key,status,confirmed_by_worker)
  select 'f1000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000005',k,'not_mentioned',true
  from unnest(array['visit_time','support','meal','sleep','discomfort','medication','cognition','notes','next_check']) k;
insert into public.record_items(org_id,record_id,item_key,status)
  select 'f1000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000003',k,'not_mentioned'
  from unnest(array['visit_time','support','meal','sleep','discomfort','medication','cognition','notes','next_check']) k;
alter table public.record_items enable trigger user;
insert into public.audio_jobs(org_id,record_id,worker_id,target,storage_path,status) values
 ('f1000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','record','f1000000-0000-0000-0000-000000000001/a','done'),
 ('f1000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000005','f2000000-0000-0000-0000-000000000001','record','f1000000-0000-0000-0000-000000000001/b','done');

-- 1. 지금 담당: 내 기록 6개 모두(어르신 1의 1개 + 어르신 2의 5개)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=6 from public.records),'담당 중이면 내 기록 모두 보임(6)');
select pg_temp.check_true((select count(*)=18 from public.record_items),'담당 중이면 항목도 보임(18)');
select pg_temp.check_true((select count(*)=2 from public.audio_jobs),'담당 중이면 녹음 작업 보임(2)');
reset role;

-- 2. 어르신 2의 담당이 끝남(행을 지움)
delete from public.assignments where worker_id='f2000000-0000-0000-0000-000000000001' and resident_id='f3000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=1 from public.records where status in ('submitted','approved')),'담당이 끝난 어르신의 끝난 기록은 숨음(어르신 1의 submitted만 남음)');
select pg_temp.check_true((select count(*)=0 from public.records where id in ('f4000000-0000-0000-0000-000000000002','f4000000-0000-0000-0000-000000000003','f4000000-0000-0000-0000-000000000004')),'숨은 기록 submitted·approved');
select pg_temp.check_true((select count(*)=2 from public.records where id in ('f4000000-0000-0000-0000-000000000005','f4000000-0000-0000-0000-000000000006')),'담당이 끝나도 draft·returned는 보임');
select pg_temp.check_true((select count(*)=0 from public.record_items where record_id='f4000000-0000-0000-0000-000000000003'),'숨은 기록의 항목도 숨음');
select pg_temp.check_true((select count(*)=9 from public.record_items where record_id='f4000000-0000-0000-0000-000000000005'),'보이는 draft의 항목은 보임');
select pg_temp.check_true((select count(*)=1 from public.audio_jobs),'숨은 기록의 녹음 작업은 숨고 draft의 것만 보임');
-- 담당이 끝나도 draft는 고치고 보낼 수 있다(보낸 뒤 숨는 것은 정책대로)
with u as (update public.records set visit_start='09:00', visit_end='10:00' where id='f4000000-0000-0000-0000-000000000005' returning id) select pg_temp.check_true((select count(*)=1 from u),'담당이 끝나도 draft 고치기 가능');
-- 보내기는 submit_own_record로 한다(직접 UPDATE는 새 행이 읽기 정책에 걸려 거절됨)
select pg_temp.check_true((select count(*)=1 from public.submit_own_record('f4000000-0000-0000-0000-000000000005','draft')),'submit_own_record: 담당이 끝나도 내 draft 보내기');
select pg_temp.check_true((select count(*)=0 from public.submit_own_record('f4000000-0000-0000-0000-000000000005','draft')),'submit_own_record: 이미 보낸 기록은 0행');
select pg_temp.check_true((select count(*)=0 from public.submit_own_record('f4000000-0000-0000-0000-000000000007','draft')),'submit_own_record: 남의 기록은 0행');
select pg_temp.check_true((select count(*)=0 from public.records where id='f4000000-0000-0000-0000-000000000005'),'보낸 뒤에는 숨음');
reset role;
select pg_temp.check_true((select status='submitted' from public.records where id='f4000000-0000-0000-0000-000000000005'),'담당이 끝나도 draft 보내기 가능');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

-- 3. 관리자: 같은 기관 기록 전체(7개)
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=7 from public.records),'관리자는 같은 기관 기록 전체');
select pg_temp.check_true((select count(*)=2 from public.audio_jobs),'관리자는 같은 기관 녹음 작업 전체');
select pg_temp.check_true((select count(*)=0 from public.submit_own_record('f4000000-0000-0000-0000-000000000006','returned')),'submit_own_record: 관리자는 남의 기록을 못 보냄');
-- 4. 담당이 없는 작성자(을): 자기 submitted 기록이 숨음
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=0 from public.records),'담당이 없는 작성자는 자기 submitted 기록이 숨음');
-- 5. 다른 기관 관리자
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=0 from public.records),'다른 기관 기록은 안 보임');
reset role;

-- 6. 다시 연결하면 다시 보임(draft였던 기록 5는 submitted가 되어 함께 보임)
insert into public.assignments(worker_id,resident_id) values ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=6 from public.records),'다시 연결하면 끝난 기록이 다시 보임(6)');
reset role;
select 'records-select-assignment: all assertions passed' as result;
rollback;
