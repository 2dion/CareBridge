-- 적용된 DB에서 실행. [기록 안 함] 사유(resolution_note) 검사. 마지막 ROLLBACK으로 합성 픽스처를 지운다.
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
create temp table note_ids (id uuid);
create temp table note_draft (data jsonb);
grant select, insert on note_ids to authenticated, service_role;
grant select on note_draft to authenticated, service_role;

insert into public.organizations(id,name) values
 ('e1000000-0000-0000-0000-000000000001','검증 기관 가'),
 ('e1000000-0000-0000-0000-000000000002','검증 기관 나');
insert into auth.users(id) values
 ('e2000000-0000-0000-0000-000000000001'),('e2000000-0000-0000-0000-000000000002'),
 ('e2000000-0000-0000-0000-000000000003'),('e2000000-0000-0000-0000-000000000004');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','worker','가상 작성자 갑','vi'),
 ('e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','reviewer','가상 담당자 갑','ko'),
 ('e2000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000001','worker','가상 작성자 을','vi'),
 ('e2000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000002','reviewer','가상 담당자 을','ko');
insert into public.residents(id,org_id,alias,care_type) values
 ('e3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','검증○○','facility');
insert into public.assignments(org_id,worker_id,resident_id) values
 ('e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=1 from public.profiles),'작성자는 자기 프로필만');
select pg_temp.expect_error('select * from public.list_org_staff()','reviewer_only');
with created as (
 insert into public.records(resident_id,care_date)
 values ('e3000000-0000-0000-0000-000000000001',(now() at time zone 'Asia/Seoul')::date) returning id
) insert into note_ids select id from created;
update public.record_items set value_ko='합성 내용', status='needs_check', confirmed=true where record_id=(select id from note_ids);
select pg_temp.expect_error($q$update public.record_items set resolution_note='작성자 사유' where record_id=(select id from note_ids) and item_key='meal'$q$,'reviewer_only');
update public.records set status='submitted' where id=(select id from note_ids);

select set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.expect_error($q$update public.record_items set resolution='omitted' where record_id=(select id from note_ids) and item_key='meal'$q$,'note_required');
select pg_temp.expect_error($q$update public.record_items set resolution='omitted', resolution_note='   ' where record_id=(select id from note_ids) and item_key='meal'$q$,'note_required');
update public.record_items set resolution='omitted', resolution_note='  원문으로 판단 불가 ' where record_id=(select id from note_ids) and item_key='meal';
select pg_temp.check_true((select resolution_note='원문으로 판단 불가' and value_ko='' and status='needs_check' from public.record_items where record_id=(select id from note_ids) and item_key='meal'),'사유는 다듬어 저장');
select pg_temp.check_true((select count(*)=1 from public.record_events where record_id=(select id from note_ids) and type='resolved' and item_key='meal' and after->>'resolution_note'='원문으로 판단 불가'),'사유가 resolved 이력에 남음');
update public.record_items set resolution='confirmed_by_reviewer', resolution_note='남은 사유' where record_id=(select id from note_ids) and item_key='sleep';
select pg_temp.check_true((select resolution_note='' from public.record_items where record_id=(select id from note_ids) and item_key='sleep'),'[확인함]에는 사유를 남기지 않음');
update public.record_items set resolution='confirmed_by_reviewer' where record_id=(select id from note_ids) and item_key='meal';
select pg_temp.check_true((select resolution_note='' from public.record_items where record_id=(select id from note_ids) and item_key='meal'),'[확인함]으로 바꾸면 사유 비움');
update public.record_items set resolution='omitted', resolution_note='다시 생략' where record_id=(select id from note_ids) and item_key='meal';
update public.record_items set resolution=null where record_id=(select id from note_ids) and item_key='meal';
select pg_temp.check_true((select resolution_note='' and resolution is null from public.record_items where record_id=(select id from note_ids) and item_key='meal'),'다시 정하기는 사유 비움');
update public.record_items set resolution='omitted', resolution_note='되돌리기 전 생략' where record_id=(select id from note_ids) and item_key='meal';
update public.records set status='returned', return_reason='합성 검토 사유' where id=(select id from note_ids);

select set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.record_items set value_ko='작성자 보완' where record_id=(select id from note_ids) and item_key='meal';
select pg_temp.check_true((select resolution is null and resolution_note='' and value_ko='작성자 보완' from public.record_items where record_id=(select id from note_ids) and item_key='meal'),'되돌린 뒤 작성자가 고치면 사유도 비움');
reset role;
rollback;
