-- 재가 지원 시간 합 검사(검사 5)의 DB 전송 가드 회귀 검사 (이슈 #278).
-- 적용된 DB에서 실행. 합성 픽스처와 검증은 모두 마지막 ROLLBACK으로 제거한다.
-- 실행: npx supabase db query --remote --yes --file supabase/tests/support-minutes-guard.sql
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
create temp table g_ids (label text, id uuid);
create temp table g_draft (label text, data jsonb);
grant select, insert on g_ids to authenticated, service_role;
grant select on g_draft to authenticated, service_role;

insert into public.organizations(id,name) values ('e1000000-0000-0000-0000-000000000278','검증 기관 278');
insert into auth.users(id) values ('e2000000-0000-0000-0000-000000000278');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('e2000000-0000-0000-0000-000000000278','e1000000-0000-0000-0000-000000000278','worker','가상 작성자 278','vi');
insert into public.residents(id,org_id,alias,care_type) values
 ('e3000000-0000-0000-0000-000000000278','e1000000-0000-0000-0000-000000000278','검증○○','home'),
 ('e3000000-0000-0000-0000-000000000279','e1000000-0000-0000-0000-000000000278','검증△△','facility');
insert into public.assignments(org_id,worker_id,resident_id) values
 ('e1000000-0000-0000-0000-000000000278','e2000000-0000-0000-0000-000000000278','e3000000-0000-0000-0000-000000000278'),
 ('e1000000-0000-0000-0000-000000000278','e2000000-0000-0000-0000-000000000278','e3000000-0000-0000-0000-000000000279');

-- 작성자: 재가 기록 3건(방문 60분 / 방문 시간 없음 / 방문 60분)과 시설 기록 1건
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000278","role":"authenticated"}',true);
with created as (
 insert into public.records(resident_id,care_date,visit_start,visit_end) values
  ('e3000000-0000-0000-0000-000000000278',(now() at time zone 'Asia/Seoul')::date - 1,'09:00','10:00') returning id
) insert into g_ids select 'exceed', id from created;
with created as (
 insert into public.records(resident_id,care_date) values
  ('e3000000-0000-0000-0000-000000000278',(now() at time zone 'Asia/Seoul')::date - 2) returning id
) insert into g_ids select 'missing', id from created;
with created as (
 insert into public.records(resident_id,care_date,visit_start,visit_end) values
  ('e3000000-0000-0000-0000-000000000278',(now() at time zone 'Asia/Seoul')::date - 3,'09:00','10:00') returning id
) insert into g_ids select 'fits', id from created;
with created as (
 insert into public.records(resident_id,care_date) values
  ('e3000000-0000-0000-0000-000000000279',(now() at time zone 'Asia/Seoul')::date - 1) returning id
) insert into g_ids select 'facility', id from created;
select pg_temp.check_true((select count(*)=3 from public.records r join g_ids g on g.id=r.id where r.form_type=12),'재가(제12호) 3건');

-- 서버(AI 초안 저장): 9개 항목을 observed로 채우고 제공 지원 분만 다르게
reset role;
insert into g_draft
 select g.label, jsonb_build_object('transcript_ko','합성 원문','form_fields','{}'::jsonb,'items',
  jsonb_agg(jsonb_build_object('item_key',i.item_key,'status','observed','value_ko','합성 내용','value_native','Nội dung',
   'reason','','reason_native','','evidence','합성 원문',
   'detail', case when i.item_key='support' then
      case g.label when 'exceed' then '{"minutes":{"physical":90,"cognitive_stimulation":60}}'::jsonb
                   when 'missing' then '{"minutes":{"physical":30}}'::jsonb
                   when 'fits' then '{"minutes":{"physical":30,"emotional":30,"bogus":500,"housework":-5}}'::jsonb
                   else '{"minutes":{"physical":999}}'::jsonb end
     else '{}'::jsonb end)))
 from public.record_items i join g_ids g on g.id=i.record_id group by g.label;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select count(*) from (
  select public.save_record_ai_draft(g.id,'e2000000-0000-0000-0000-000000000278','',d.data)
    from g_ids g join g_draft d on d.label=g.label) s;

-- 작성자가 화면 없이 PostgREST로 직접: 항목 확인 → 상태 submitted
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000278","role":"authenticated"}',true);
update public.record_items set confirmed_by_worker=true where record_id in (select id from g_ids);

-- 1) 합 150분 > 방문 60분, 제공 지원이 '관찰'인 채 직접 전송 → 거절
select pg_temp.expect_error($q$update public.records set status='submitted' where id=(select id from g_ids where label='exceed')$q$,'support_minutes_exceed_visit');
select pg_temp.check_true((select status='draft' from public.records where id=(select id from g_ids where label='exceed')),'거절된 기록은 draft 그대로');

-- 2) 방문 시간을 모르는데 분 30 → 거절. 분을 지우면 통과
select pg_temp.expect_error($q$update public.records set status='submitted' where id=(select id from g_ids where label='missing')$q$,'visit_minutes_missing');
update public.record_items set detail='{}'::jsonb where record_id=(select id from g_ids where label='missing') and item_key='support';
update public.record_items set confirmed_by_worker=true where record_id=(select id from g_ids where label='missing') and item_key='support';
update public.records set status='submitted' where id=(select id from g_ids where label='missing');
select pg_temp.check_true((select status='submitted' from public.records where id=(select id from g_ids where label='missing')),'분이 없으면 방문 시간을 몰라도 전송');

-- 3) 합 60분 = 방문 60분(정해진 칸·0 이상 정수만 합산) → 통과
update public.records set status='submitted' where id=(select id from g_ids where label='fits');
select pg_temp.check_true((select status='submitted' from public.records where id=(select id from g_ids where label='fits')),'합 ≤ 방문 시간은 전송');

-- 4) 시설(제16호)은 보지 않음
update public.records set status='submitted' where id=(select id from g_ids where label='facility');
select pg_temp.check_true((select status='submitted' from public.records where id=(select id from g_ids where label='facility')),'시설 기록은 검사하지 않음');

-- 5) 화면 흐름: 서버가 전송 직전 재검사(save_ai_item check)로 '확인 필요'와 이유를 붙이면 전송된다
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select count(*) from public.save_ai_item((select id from g_ids where label='exceed'),'support','e2000000-0000-0000-0000-000000000278','합성 내용','check',
 '{"status":"needs_check","reason":"지원별 제공시간 합이 방문 시간보다 김 (150분 > 60분)","reason_native":"Tổng thời gian hỗ trợ dài hơn thời gian thăm (150 phút > 60 phút)"}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000278","role":"authenticated"}',true);
update public.records set status='submitted' where id=(select id from g_ids where label='exceed');
select pg_temp.check_true((select r.status='submitted' and i.status='needs_check' and i.reason<>''
  from public.records r join public.record_items i on i.record_id=r.id and i.item_key='support'
  where r.id=(select id from g_ids where label='exceed')),'확인 필요로 표시된 기록은 전송되고 관리자가 M2에서 정함');

rollback;
