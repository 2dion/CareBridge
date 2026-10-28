-- 적용된 DB에서 실행. save_ai_item(항목 하나 재번역·AI 항목 보태기) 검사. 마지막 ROLLBACK으로 합성 픽스처를 지운다.
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
create temp table item_ids (id uuid);
create temp table item_draft (data jsonb);
grant select, insert on item_ids to authenticated, service_role;
grant select on item_draft to authenticated, service_role;

insert into public.organizations(id,name) values
 ('d1000000-0000-0000-0000-000000000001','검증 기관 가'),
 ('d1000000-0000-0000-0000-000000000002','검증 기관 나');
insert into auth.users(id) values
 ('d2000000-0000-0000-0000-000000000001'),('d2000000-0000-0000-0000-000000000002'),
 ('d2000000-0000-0000-0000-000000000003'),('d2000000-0000-0000-0000-000000000004');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','worker','가상 작성자 갑','vi'),
 ('d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','reviewer','가상 담당자 갑','ko'),
 ('d2000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000001','worker','가상 작성자 을','vi'),
 ('d2000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000002','reviewer','가상 담당자 을','ko');
insert into public.residents(id,org_id,alias,care_type) values
 ('d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','검증○○','facility');
insert into public.assignments(org_id,worker_id,resident_id) values
 ('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=1 from public.profiles),'작성자는 자기 프로필만');
select pg_temp.expect_error('select * from public.list_org_staff()','reviewer_only');
with created as (
 insert into public.records(resident_id,care_date)
 values ('d3000000-0000-0000-0000-000000000001',(now() at time zone 'Asia/Seoul')::date) returning id
) insert into item_ids select id from created;
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'meal','d2000000-0000-0000-0000-000000000001','','translation','{}')$q$,'permission denied');
update public.record_items set value_ko='작성자가 쓴 식사' where record_id=(select id from item_ids) and item_key='meal';

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- 재번역: 번역만 바뀌고 출처는 사람 그대로
select * from public.save_ai_item((select id from item_ids),'meal','d2000000-0000-0000-0000-000000000001','작성자가 쓴 식사','translation','{"value_native":"Bữa ăn do người viết ghi","value_ko":"무시됨","source":"ai"}');
select pg_temp.check_true((select value_native='Bữa ăn do người viết ghi' and value_ko='작성자가 쓴 식사' and source='worker' from public.record_items where record_id=(select id from item_ids) and item_key='meal'),'재번역은 번역만 저장');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'meal','d2000000-0000-0000-0000-000000000001','옛 글','translation','{"value_native":"x"}')$q$,'stale_item');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'meal','d2000000-0000-0000-0000-000000000004','작성자가 쓴 식사','translation','{"value_native":"x"}')$q$,'not_record_worker');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'meal','d2000000-0000-0000-0000-000000000002','작성자가 쓴 식사','translation','{"value_native":"x"}')$q$,'invalid_transition');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'sleep','d2000000-0000-0000-0000-000000000001','','translation','{"value_native":"x"}')$q$,'invalid_item');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'meal','d2000000-0000-0000-0000-000000000001','작성자가 쓴 식사','other','{}')$q$,'invalid_mode');

-- 항목 보태기: 작성자만, 출처 worker, [맞아요] 다시
select * from public.save_ai_item((select id from item_ids),'sleep','d2000000-0000-0000-0000-000000000001','','item','{"value_ko":"밤에 두 번 깸","value_native":"Thức dậy hai lần","status":"needs_check","evidence":"밤에 두 번","reason":"시간 확인 필요","reason_native":"Cần kiểm tra giờ","detail":{}}');
select pg_temp.check_true((select value_ko='밤에 두 번 깸' and reason_native='Cần kiểm tra giờ' and evidence='밤에 두 번' and source='worker' and not confirmed from public.record_items where record_id=(select id from item_ids) and item_key='sleep'),'항목 보태기 저장');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'notes','d2000000-0000-0000-0000-000000000003','','item','{"status":"observed"}')$q$,'not_record_worker');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'notes','d2000000-0000-0000-0000-000000000002','','item','{"status":"observed"}')$q$,'not_record_worker');

-- 보내고 담당자가 고친 뒤 재번역은 담당자 이름으로 가능, 항목 보태기는 불가
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.record_items set confirmed=true where record_id=(select id from item_ids);
update public.records set status='submitted' where id=(select id from item_ids);
select set_config('request.jwt.claims','{"sub":"d2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
update public.record_items set value_ko='담당자가 고친 식사' where record_id=(select id from item_ids) and item_key='meal';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select * from public.save_ai_item((select id from item_ids),'meal','d2000000-0000-0000-0000-000000000002','담당자가 고친 식사','translation','{"value_native":"Bữa ăn do người duyệt sửa"}');
select pg_temp.check_true((select value_native='Bữa ăn do người duyệt sửa' and source='reviewer' from public.record_items where record_id=(select id from item_ids) and item_key='meal'),'담당자 수정 뒤 재번역');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'sleep','d2000000-0000-0000-0000-000000000001','밤에 두 번 깸','item','{"status":"observed"}')$q$,'not_record_worker');
select pg_temp.expect_error($q$select * from public.save_ai_item((select id from item_ids),'meal','d2000000-0000-0000-0000-000000000001','담당자가 고친 식사','translation','{"value_native":"x"}')$q$,'invalid_transition');

-- 되돌린 뒤 항목 보태기는 resolution·사유를 비움
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
update public.record_items set resolution='omitted', resolution_note='판단 불가' where record_id=(select id from item_ids) and item_key='sleep';
update public.records set status='returned', return_reason='합성 검토 사유' where id=(select id from item_ids);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select * from public.save_ai_item((select id from item_ids),'sleep','d2000000-0000-0000-0000-000000000001','','item','{"value_ko":"밤 11시, 새벽 3시에 깸","status":"observed","evidence":"11시랑 3시","detail":{}}');
select pg_temp.check_true((select resolution is null and resolution_note='' and value_ko='밤 11시, 새벽 3시에 깸' and source='worker' from public.record_items where record_id=(select id from item_ids) and item_key='sleep'),'되돌린 뒤 보태기는 다시 확인');
select pg_temp.check_true((select count(*)>0 from public.record_events where record_id=(select id from item_ids) and item_key='sleep' and after ? 'reason_native'),'보태기도 이력에 남음');
reset role;
rollback;
