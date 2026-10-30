-- 시연 데이터 다시 채우기: 테스트 기록을 지우고, 화면에 미리 깔아 둘 시연용 기록을 넣습니다.
-- 근거: 이슈 #156, 문서/회의록/2026-10-29-멘토링.md §2-3. 내용은 data/cases/의 합성 사례(AGENTS.md 원칙 9).
-- 만든 방법: data/demo/build_demo_sql.py 가 이 파일을 만듭니다. 직접 고치지 말고 스크립트·템플릿을 고칩니다.
--
-- 사용: 클라우드 대시보드 SQL Editor에서 seed.sql을 먼저 돌린 적이 있으면, 이 파일을 통째로 한 번 실행.
--       시연 전날 다시 돌리면 그날 기준 날짜로 다시 채워집니다(여러 번 돌려도 같은 모양).
--
-- 하는 일
--   1. 데모 요양센터·데모 교육원의 기록·기록 없음 처리를 모두 지움(승인된 기록 포함)
--   2. 합성 어르신 8명을 더하고(이미 있으면 그대로), 담당 연결의 시작일·방문 요일을 맞춤
--   3. 교육생 계정 이름을 가명 '응옥'으로(화면에 '교육생 교육생'이 보이지 않게)
--   4. 기록 14건을 실제 화면과 같은 순서(만들기 → AI 정리 → [맞아요] → 전송 → [확인함]·승인 또는 되돌리기)로 넣고,
--      이력 시각을 돌봄 날짜에 맞게 옮김
--   5. 시나리오 1·2·3 어르신(김○○·이○○·최○○)의 '오늘' 기록은 비워 둠(시연 때 새로 씀)
--
-- 채워지는 모양 (오늘 = 실행한 날, 한국 날짜)
--   검토 대기 6: 확인 필요 있는 것(한○○·정○○), 확인 필요 0(윤○○), 지연전송(서○○, 3일 전 돌봄을 어제 전송),
--               재전송(장○○, 되돌림 뒤 다시 전송), 교육용(최○○)
--   수정 필요 1: 박○○ / 임시 저장 1: 강○○ 어제
--   승인 완료 6: 시설(김○○ 2건·강○○·최○○), 재가(이○○·오○○) → 제16호·제12호 PDF
--   작성 전: 강○○·서○○·박○○ 등 지난 7일 빈 날, 오○○ 방문일 / 기한 지난 빈 기록: 오○○ 8~14일 전 방문일
--   기록 없음 처리 1: 오○○ 방문 취소
--
-- 승인된 기록은 트리거가 삭제·수정을 막으므로(record_locked) 이 안에서만 잠시 끕니다. 한 트랜잭션이라
-- 중간에 실패하면 모두 되돌아가고 트리거도 꺼진 채로 남지 않습니다.

begin;

-- ── 0. 기준 값 ───────────────────────────────────────────
create temp table demo_ctx on commit drop as
select (now() at time zone 'Asia/Seoul')::date as today,
       (select id from auth.users where email = 'worker@carebridge.test')   as worker,
       (select id from auth.users where email = 'reviewer@carebridge.test') as reviewer,
       (select id from auth.users where email = 'trainee@carebridge.test')  as trainee,
       (select id from auth.users where email = 'trainer@carebridge.test')  as trainer;

do $$ begin
  if exists (select 1 from demo_ctx where worker is null or reviewer is null or trainee is null or trainer is null) then
    raise exception 'demo_accounts_missing: seed.sql과 데모 계정 4개를 먼저 만드세요';
  end if;
end $$;

-- ── 1. 지우기 ────────────────────────────────────────────
alter table public.records disable trigger records_before_delete;
delete from public.records
where org_id in ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002');
alter table public.records enable trigger records_before_delete;
delete from public.no_care_days
where org_id in ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002');

-- 교육생 계정 이름: 역할 이름('교육생')과 같으면 화면에 "교육생 교육생"으로 보여 가명으로(#181, 실명 아님)
update public.profiles set name = '응옥'
where id = (select trainee from demo_ctx) and name = '교육생';

-- ── 2. 합성 어르신과 담당 연결 ────────────────────────────
-- 이름은 data/cases/ 합성 사례의 가명. 방문 요일은 data/README.md '재가 합성 어르신 방문 요일'.
insert into public.residents (id, org_id, alias, care_type, is_synthetic) values
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000001', '한○○ 어르신', 'facility', true),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000001', '강○○ 어르신', 'facility', true),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000001', '서○○ 어르신', 'facility', true),
  ('00000000-0000-4000-b000-000000000007', '00000000-0000-4000-a000-000000000001', '박○○ 어르신', 'facility', true),
  ('00000000-0000-4000-b000-000000000008', '00000000-0000-4000-a000-000000000001', '정○○ 어르신', 'home', true),
  ('00000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000001', '윤○○ 어르신', 'home', true),
  ('00000000-0000-4000-b000-000000000010', '00000000-0000-4000-a000-000000000001', '장○○ 어르신', 'home', true),
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-a000-000000000001', '오○○ 어르신', 'home', true)
on conflict (id) do nothing;

create temp table demo_res on commit drop as
select * from (values
  ('kim',   '00000000-0000-4000-b000-000000000001'::uuid, 'worker',  '매일 07:00~16:00',    null::smallint[]),
  ('lee',   '00000000-0000-4000-b000-000000000002'::uuid, 'worker',  '평일 14:00~17:00',    '{1,2,3,4,5}'),
  ('choi',  '00000000-0000-4000-b000-000000000003'::uuid, 'trainee', '실습 09:00~12:00',    null),
  ('han',   '00000000-0000-4000-b000-000000000004'::uuid, 'worker',  '매일 07:00~16:00',    null),
  ('kang',  '00000000-0000-4000-b000-000000000005'::uuid, 'worker',  '매일 07:00~16:00',    null),
  ('seo',   '00000000-0000-4000-b000-000000000006'::uuid, 'worker',  '매일 07:00~16:00',    null),
  ('park',  '00000000-0000-4000-b000-000000000007'::uuid, 'worker',  '매일 07:00~16:00',    null),
  ('jeong', '00000000-0000-4000-b000-000000000008'::uuid, 'worker',  '월·수·금 09:00~12:00', '{1,3,5}'),
  ('yoon',  '00000000-0000-4000-b000-000000000009'::uuid, 'worker',  '화·금 15:00~18:00',   '{2,5}'),
  ('jang',  '00000000-0000-4000-b000-000000000010'::uuid, 'worker',  '월~토 10:00~13:00',   '{1,2,3,4,5,6}'),
  ('oh',    '00000000-0000-4000-b000-000000000011'::uuid, 'worker',  '월·수·금 13:00~16:00', '{1,3,5}')
) as t(code, resident_id, who, schedule, visit_days);

-- 재가: n일 전이거나 그보다 앞선 날 중 가장 가까운 방문일
create function pg_temp.visit_day(p_code text, p_back int) returns date
language sql stable as $$
  select max(d)::date
  from demo_ctx c, demo_res r,
       generate_series(c.today - p_back - 13, c.today - p_back, interval '1 day') as g(d)
  where r.code = p_code
    and (r.visit_days is null or extract(isodow from d)::smallint = any (r.visit_days))
$$;

-- 담당 시작일: 기록이 있는 첫날부터(그 앞의 빈 날이 '작성 전'으로 쌓이지 않게). 오○○만 14일 전(기한 지난 빈 기록용)
insert into public.assignments (worker_id, resident_id, schedule, visit_days, start_date)
select case r.who when 'worker' then c.worker else c.trainee end, r.resident_id, r.schedule, r.visit_days,
       case r.code
         when 'kim' then c.today - 2   when 'choi' then c.today - 2
         when 'han' then c.today - 1   when 'kang' then c.today - 3
         when 'seo' then c.today - 3   when 'park' then c.today - 2
         when 'oh'  then c.today - 14
         else pg_temp.visit_day(r.code, 1)
       end
from demo_res r, demo_ctx c
on conflict (worker_id, resident_id) do update
  set schedule = excluded.schedule, visit_days = excluded.visit_days, start_date = excluded.start_date;

-- ── 3. 기록 넣기 도우미 ───────────────────────────────────
create temp table demo_plan (id uuid, created timestamptz, submitted timestamptz, approved timestamptz) on commit drop;

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true)
$$;

-- 지금 단계에서 생긴 이력(시각 = 트랜잭션 시작 시각)을 정한 시각으로 옮김.
-- 모든 단계(전송·되돌림·다시 전송·승인)를 돌봄 날 저녁 안에 두어, 언제 돌려도 미래 시각이 생기지 않음(#181).
-- 지연전송만 어제 오전. least()는 혹시 모를 미래 시각을 막는 안전장치.
create function pg_temp.stamp(p_rec uuid, p_ts timestamptz) returns timestamptz language plpgsql as $$
declare ts timestamptz := least(p_ts, now() - interval '2 minutes');
begin
  update public.record_events set created_at = ts where record_id = p_rec and created_at = now();
  return ts;
end $$;

create function pg_temp.kst(p_d date, p_t time) returns timestamptz language sql immutable as $$
  select (p_d + p_t) at time zone 'Asia/Seoul'
$$;

create function pg_temp.demo_record(
  p_res text, p_who text, p_date date, p_transcript text, p_transcript_ko text,
  p_items jsonb, p_form_fields jsonb, p_visit_start text, p_visit_end text,
  p_flow text, p_reason text, p_reason_native text, p_case text
) returns uuid language plpgsql as $$
declare
  c demo_ctx%rowtype;
  wk uuid; rv uuid; res uuid; rec uuid;
  t_created timestamptz; t_sub timestamptz; t_appr timestamptz;
begin
  select * into c from demo_ctx;
  wk := case p_who when 'worker' then c.worker else c.trainee end;
  rv := case p_who when 'worker' then c.reviewer else c.trainer end;
  select resident_id into res from demo_res where code = p_res;

  -- 만들기 (작성자). 지연전송은 어제 늦게 씀
  perform pg_temp.act(wk);
  insert into public.records (resident_id, worker_id, care_date, transcript, transcript_ko, form_fields, visit_start, visit_end)
  values (res, wk, p_date, p_transcript, p_transcript_ko, coalesce(p_form_fields, '{}'), p_visit_start::time, p_visit_end::time)
  returning id into rec;
  t_created := pg_temp.stamp(rec, case when p_flow = 'submitted_late'
    then pg_temp.kst(c.today - 1, '10:00') else pg_temp.kst(p_date, '16:20') end);

  if p_flow = 'draft' then  -- 임시 저장: 받아쓴 글만 있고 정리 전
    insert into demo_plan values (rec, t_created, null, null);
    return rec;
  end if;

  -- AI 정리 (서버)
  perform pg_temp.act(null);
  update public.record_items ri
  set value_ko = x.value_ko, value_native = x.value_native, status = x.status,
      evidence = x.evidence, reason = x.reason, detail = coalesce(x.detail, '{}')
  from jsonb_to_recordset(p_items) as x(item_key text, value_ko text, value_native text, status text,
                                        evidence text, reason text, detail jsonb)
  where ri.record_id = rec and ri.item_key = x.item_key;
  perform pg_temp.stamp(rec, t_created + interval '1 minute');

  -- [맞아요] → 전송 (작성자)
  perform pg_temp.act(wk);
  update public.record_items set confirmed_by_worker = true where record_id = rec;
  perform pg_temp.stamp(rec, t_created + interval '4 minutes');
  update public.records set status = 'submitted' where id = rec;
  t_sub := pg_temp.stamp(rec, t_created + interval '10 minutes');

  if p_flow in ('returned', 'resent') then
    perform pg_temp.act(rv);
    update public.records set status = 'returned', return_reason = p_reason, return_reason_native = p_reason_native
    where id = rec;
    perform pg_temp.stamp(rec, pg_temp.kst(p_date, '18:00'));
    if p_flow = 'resent' then  -- 작성자가 배변 칸을 고쳐 다시 전송 (제공 지원은 [확인함]이 풀림)
      perform pg_temp.act(wk);
      update public.record_items
      set value_ko = '기저귀 교환 2회 (대변 실수 1회·소변 실수 2회 포함)',
          value_native = 'Thay tã 2 lần (gồm đại tiện không tự chủ 1 lần, tiểu tiện không tự chủ 2 lần)',
          status = 'observed', reason = ''
      where record_id = rec and item_key = 'support';
      update public.records set form_fields = form_fields || '{"stool_accidents": 1, "urine_accidents": 2}' where id = rec;
      perform pg_temp.stamp(rec, pg_temp.kst(p_date, '19:00'));
      update public.records set status = 'submitted' where id = rec;
      t_sub := pg_temp.stamp(rec, pg_temp.kst(p_date, '19:10'));
    end if;
  end if;

  if p_flow = 'approved' then  -- 관리자가 확인 필요를 [확인함] → 승인
    perform pg_temp.act(rv);
    update public.record_items set resolution = 'confirmed_by_reviewer'
    where record_id = rec and status = 'needs_check';
    perform pg_temp.stamp(rec, pg_temp.kst(p_date, '18:00'));
    update public.records set status = 'approved' where id = rec;
    t_appr := pg_temp.stamp(rec, pg_temp.kst(p_date, '18:05'));
  end if;

  insert into demo_plan values (rec, t_created,
    (select min(created_at) from public.record_events where record_id = rec and type = 'submitted' and created_at >= t_sub),
    t_appr);
  return rec;
end $$;

-- ── 4. 기록 14건 ──────────────────────────────────────────
do $$ declare today date := (select today from demo_ctx); begin
--@@RECORDS@@
end $$;

-- 기록 없음 처리 1건: 오○○ 지난 7일 안 방문일(승인 기록 날 앞) — 방문 취소
do $$ begin perform pg_temp.act((select worker from demo_ctx)); end $$;
insert into public.no_care_days (resident_id, care_date, reason, note)
select '00000000-0000-4000-b000-000000000011', d, 'visit_cancelled', '병원 외래 진료로 방문 취소(보호자 연락)'
from (select pg_temp.visit_day('oh', (select today from demo_ctx) - pg_temp.visit_day('oh', 1) + 1) as d) x
where d >= (select today from demo_ctx) - 7;
do $$ begin perform pg_temp.act(null); end $$;

-- ── 5. 기록 시각을 이력과 맞춤 (처음 만든 시각·전송 시각·승인 시각) ──
alter table public.records disable trigger user;
update public.records r
set created_at = p.created, submitted_at = p.submitted, approved_at = p.approved
from demo_plan p where p.id = r.id;
alter table public.records enable trigger user;

-- ── 6. 확인 ──────────────────────────────────────────────
do $$ begin
  if exists (select 1 from public.records r, demo_ctx c
             where r.care_date = c.today
               and r.resident_id in ('00000000-0000-4000-b000-000000000001',
                                     '00000000-0000-4000-b000-000000000002',
                                     '00000000-0000-4000-b000-000000000003')) then
    raise exception 'scenario_today_not_empty';
  end if;
end $$;

commit;

-- 결과 보기 (SQL Editor 아래에 표로 나옴)
select o.name as 기관, r.status as 상태, count(*) as 건수
from public.records r join public.organizations o on o.id = r.org_id
where r.org_id in ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002')
group by 1, 2 order by 1, 2;
