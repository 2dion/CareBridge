-- 적용된 DB에서 실행. 합성 픽스처와 검증은 모두 마지막 ROLLBACK으로 제거한다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void
language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise; end if;
    caught := true;
  end;
  if not caught then raise exception 'expected error: %', expected; end if;
end $$;
create temp table contract_ids (id uuid);
create temp table contract_draft (data jsonb);
grant select, insert on contract_ids to authenticated, service_role;
grant select on contract_draft to authenticated, service_role;

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
insert into public.residents(id,org_id,alias,care_type) values
 ('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','검증○○','facility');
insert into public.assignments(org_id,worker_id,resident_id) values
 ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=1 from public.profiles),'작성자는 자기 프로필만');
select pg_temp.expect_error('select * from public.list_org_staff()','reviewer_only');
select pg_temp.expect_error($q$select * from public.record_blocked_names(null,null)$q$,'permission denied');
with created as (
 insert into public.records(resident_id,care_date)
 values ('f3000000-0000-0000-0000-000000000001',(now() at time zone 'Asia/Seoul')::date) returning id
) insert into contract_ids select id from created;
select pg_temp.expect_error($q$update public.records set status='submitted' where id=(select id from contract_ids)$q$,'unconfirmed_items');
select pg_temp.expect_error($q$update public.record_items set source='worker' where record_id=(select id from contract_ids)$q$,'permission denied');
select pg_temp.expect_error($q$update public.record_items set reason_native='위조' where record_id=(select id from contract_ids)$q$,'permission denied');

reset role;
insert into contract_draft select jsonb_build_object('transcript_ko','합성 원문','form_fields','{}'::jsonb,'items',
 jsonb_agg(jsonb_build_object('item_key',item_key,'status','needs_check','value_ko','확인할 내용','value_native','Nội dung',
 'reason','확인 필요 이유','reason_native','Lý do cần kiểm tra','evidence','합성 원문','detail','{}'::jsonb)))
 from public.record_items where record_id=(select id from contract_ids);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.check_true((select count(*)=3 from public.record_blocked_names((select id from contract_ids),'f2000000-0000-0000-0000-000000000001')),'서버는 해당 기관 이름 목록만');
select pg_temp.expect_error($q$select * from public.record_blocked_names((select id from contract_ids),'f2000000-0000-0000-0000-000000000003')$q$,'not_record_worker');
select * from public.save_record_ai_draft((select id from contract_ids),'f2000000-0000-0000-0000-000000000001','',(select data from contract_draft));
select pg_temp.expect_error($q$select * from public.save_record_ai_draft((select id from contract_ids),'f2000000-0000-0000-0000-000000000001','오래된 원문',(select data from contract_draft))$q$,'stale_draft');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=9 from public.record_items where record_id=(select id from contract_ids) and reason_native='Lý do cần kiểm tra'),'저장 후 사용자 RLS 재조회에서도 이유 번역 9개 보존');
update public.record_items set value_ko='작성자 직접 수정' where record_id=(select id from contract_ids) and item_key='notes';
select pg_temp.check_true((select source='worker' and value_native='' from public.record_items where record_id=(select id from contract_ids) and item_key='notes'),'작성자 수정은 서버 출처 판정·오래된 번역 비움');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.expect_error($q$update public.record_items set source='ai' where record_id=(select id from contract_ids) and item_key='notes'$q$,'human_value_protected');
select * from public.save_record_ai_draft((select id from contract_ids),'f2000000-0000-0000-0000-000000000001','',(select data from contract_draft));
select pg_temp.check_true((select value_ko='작성자 직접 수정' and source='worker' from public.record_items where record_id=(select id from contract_ids) and item_key='notes'),'AI 재저장 시 사람 수정 보존');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.expect_error($q$update public.records set status='submitted' where id=(select id from contract_ids)$q$,'unconfirmed_items');
update public.record_items set confirmed=true where record_id=(select id from contract_ids);
update public.records set status='submitted' where id=(select id from contract_ids);

select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=0 from public.records where id=(select id from contract_ids)),'다른 기관 기록 차단');
select pg_temp.check_true((select count(*)=1 from public.list_org_staff()),'관리자 명단은 자기 기관만');
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=1 from public.profiles),'관리자도 타인의 개인 설정 직접 조회 불가');
select pg_temp.check_true((select count(*)=3 from public.list_org_staff()),'관리자는 업무용 기관 명단 조회');
select pg_temp.expect_error($q$select font_size from public.list_org_staff()$q$,'does not exist');
select pg_temp.expect_error($q$select * from public.record_blocked_names(null,null)$q$,'permission denied');
select pg_temp.expect_error($q$update public.records set status='approved' where id=(select id from contract_ids)$q$,'unresolved_needs_check');
update public.record_items set resolution='confirmed_by_reviewer' where record_id=(select id from contract_ids);
update public.record_items set resolution='omitted', resolution_note='합성 생략 사유' where record_id=(select id from contract_ids) and item_key='meal';
select pg_temp.check_true((select status='needs_check' and resolution='omitted' and value_ko='' and value_native='' and source='reviewer' from public.record_items where record_id=(select id from contract_ids) and item_key='meal'),'기록 안 함은 needs_check 유지·두 언어 비움·관리자 출처');
update public.record_items set resolution=null where record_id=(select id from contract_ids) and item_key='meal';
select pg_temp.expect_error($q$update public.records set status='approved' where id=(select id from contract_ids)$q$,'unresolved_needs_check');
update public.record_items set resolution='omitted', resolution_note='합성 생략 사유' where record_id=(select id from contract_ids) and item_key='meal';
update public.records set status='returned',return_reason='합성 검토 사유' where id=(select id from contract_ids);
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.record_items set value_ko='생략 뒤 작성자 보완' where record_id=(select id from contract_ids) and item_key='meal';
select pg_temp.check_true((select resolution is null and value_ko='생략 뒤 작성자 보완' and source='worker' from public.record_items where record_id=(select id from contract_ids) and item_key='meal'),'되돌린 생략 항목 수정은 보존하고 resolution 해제');
update public.record_items set confirmed=true where record_id=(select id from contract_ids);
update public.records set status='submitted' where id=(select id from contract_ids);
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
update public.record_items set resolution='confirmed_by_reviewer' where record_id=(select id from contract_ids) and item_key='meal';
update public.records set status='approved' where id=(select id from contract_ids);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.expect_error($q$update public.record_items set value_ko='승인 후 변경' where record_id=(select id from contract_ids)$q$,'record_locked');
select pg_temp.check_true((select count(*)>0 from public.record_events where record_id=(select id from contract_ids) and after ? 'reason_native'),'이유 번역 변경도 이력에 보존');
reset role;
rollback;
