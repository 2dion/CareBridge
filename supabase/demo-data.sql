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
-- 흐름: 돌봄 날 작성·전송 → 다음 날 오전 관리자 검토(승인·되돌림), 되돌린 기록은 다음 날 오후 재전송.
-- 다음 날 시각이 아직 오지 않았으면(어제 기록을 오전에 돌릴 때) 검토를 돌봄 날 저녁으로 둠 → 미래 시각 없음(#181).
-- least()는 혹시 모를 미래 시각을 막는 안전장치.
create function pg_temp.stamp(p_rec uuid, p_ts timestamptz) returns timestamptz language plpgsql as $$
declare ts timestamptz := least(p_ts, now() - interval '2 minutes');
begin
  update public.record_events set created_at = ts where record_id = p_rec and created_at = now();
  return ts;
end $$;

create function pg_temp.kst(p_d date, p_t time) returns timestamptz language sql immutable as $$
  select (p_d + p_t) at time zone 'Asia/Seoul'
$$;

create temp sequence demo_seq;

create function pg_temp.demo_record(
  p_res text, p_who text, p_date date, p_transcript text, p_transcript_ko text,
  p_items jsonb, p_form_fields jsonb, p_visit_start text, p_visit_end text,
  p_flow text, p_reason text, p_reason_native text, p_case text
) returns uuid language plpgsql as $$
declare
  c demo_ctx%rowtype;
  wk uuid; rv uuid; res uuid; rec uuid;
  t_created timestamptz; t_sub timestamptz; t_appr timestamptz;
  n int := nextval('demo_seq');      -- 기록 번호: 기록마다 시각을 조금씩 다르게
  o interval;                        -- 0~39분
  rd date; r0 time;                  -- 검토 날과 그날 검토 시작 시각
begin
  o := ((n * 17) % 40) * interval '1 minute';
  -- 검토는 다음 날 오전(09:05~11:25). 되돌린 기록은 다음 날 오후 재전송까지 지났는지 보고 정함
  r0 := time '09:05' + ((n * 29) % 140) * interval '1 minute';
  rd := p_date + 1;
  if pg_temp.kst(rd, case when p_flow = 'resent' then time '13:40' + o else r0 end) > now() - interval '5 minutes' then
    rd := p_date; r0 := time '19:20' + o;   -- 다음 날 시각이 아직 안 옴 → 돌봄 날 저녁
  end if;

  select * into c from demo_ctx;
  wk := case p_who when 'worker' then c.worker else c.trainee end;
  rv := case p_who when 'worker' then c.reviewer else c.trainer end;
  select resident_id into res from demo_res where code = p_res;

  -- 만들기 (작성자). 지연전송은 어제 늦게 씀
  perform pg_temp.act(wk);
  insert into public.records (resident_id, worker_id, care_date, transcript, transcript_ko, form_fields, visit_start, visit_end)
  values (res, wk, p_date, p_transcript, p_transcript_ko, coalesce(p_form_fields, '{}'), p_visit_start::time, p_visit_end::time)
  returning id into rec;
  -- 시설은 근무 끝(16:00), 재가는 방문 끝난 뒤 10~49분에 씀
  t_created := pg_temp.stamp(rec, case when p_flow = 'submitted_late'
    then pg_temp.kst(c.today - 1, '09:40') + o
    else pg_temp.kst(p_date, coalesce(p_visit_end::time, '16:00')) + interval '10 minutes' + o end);

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
  t_sub := pg_temp.stamp(rec, t_created + interval '6 minutes' + (n % 5) * interval '1 minute');

  if p_flow in ('returned', 'resent') then
    perform pg_temp.act(rv);
    update public.records set status = 'returned', return_reason = p_reason, return_reason_native = p_reason_native
    where id = rec;
    perform pg_temp.stamp(rec, pg_temp.kst(rd, r0));
    if p_flow = 'resent' then  -- 작성자가 배변 칸을 고쳐 다시 전송 (제공 지원은 [확인함]이 풀림)
      perform pg_temp.act(wk);
      update public.record_items
      set value_ko = '기저귀 교환 2회 (대변 실수 1회·소변 실수 2회 포함)',
          value_native = 'Thay tã 2 lần (gồm đại tiện không tự chủ 1 lần, tiểu tiện không tự chủ 2 lần)',
          status = 'observed', reason = ''
      where record_id = rec and item_key = 'support';
      update public.records set form_fields = form_fields || '{"stool_accidents": 1, "urine_accidents": 2}' where id = rec;
      perform pg_temp.stamp(rec, case when rd > p_date then pg_temp.kst(rd, time '13:30' + o)
                                      else pg_temp.kst(rd, r0) + interval '50 minutes' end);
      update public.records set status = 'submitted' where id = rec;
      t_sub := pg_temp.stamp(rec, case when rd > p_date then pg_temp.kst(rd, time '13:40' + o)
                                       else pg_temp.kst(rd, r0) + interval '58 minutes' end);
    end if;
  end if;

  if p_flow = 'approved' then  -- 관리자가 확인 필요를 [확인함] → 승인
    perform pg_temp.act(rv);
    update public.record_items set resolution = 'confirmed_by_reviewer'
    where record_id = rec and status = 'needs_check';
    perform pg_temp.stamp(rec, pg_temp.kst(rd, r0));
    update public.records set status = 'approved' where id = rec;
    t_appr := pg_temp.stamp(rec, pg_temp.kst(rd, r0) + (2 + n % 6) * interval '1 minute');
  end if;

  insert into demo_plan values (rec, t_created,
    (select min(created_at) from public.record_events where record_id = rec and type = 'submitted' and created_at >= t_sub),
    t_appr);
  return rec;
end $$;

-- ── 4. 기록 14건 ──────────────────────────────────────────
do $$ declare today date := (select today from demo_ctx); begin
  perform pg_temp.demo_record('kim', 'worker', today - 2, 'Sáng nay tôi rửa mặt và thay quần áo cho bà. Cứ hai tiếng tôi đổi tư thế cho bà một lần. Bữa trưa bà ăn cháo, ăn được một ít. Hôm nay tôi thay tã cho bà ba lần. Bà nói tối qua bà ngủ không ngon. Bà nói đầu gối bên phải bị đau. Sau bữa trưa tôi thấy bà uống thuốc. Ngày mai chắc phải xem lại đầu gối của bà.', '아침에 세수해 드리고 옷 갈아입혀 드렸어요. 두 시간마다 자세 바꿔 드렸어요. 점심은 죽으로 조금 드셨어요. 오늘 기저귀는 세 번 갈아 드렸어요. 어젯밤에 잠을 잘 못 주무셨다고 하셨어요. 오른쪽 무릎이 아프다고 하셨어요. 점심 드시고 약 드시는 거 봤어요. 내일 무릎 다시 봐야 할 것 같아요.',
    $j$[{"item_key": "visit_time", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "support", "value_ko": "세면·옷 갈아입기 도움, 체위변경(2시간마다), 기저귀 교환 3회", "value_native": "Hỗ trợ rửa mặt và thay quần áo, đổi tư thế (mỗi 2 giờ), thay tã 3 lần", "status": "observed", "evidence": "Sáng nay tôi rửa mặt và thay quần áo cho bà. Cứ hai tiếng tôi đổi tư thế cho bà một lần.", "reason": "", "detail": {"checks": ["세면·구강청결·머리감기·몸단장·옷 갈아입기 도움 등", "체위변경(2시간마다)", "화장실이용하기(기저귀 교환)"], "toilet_count": 3}}, {"item_key": "meal", "value_ko": "점심 죽을 조금 드심", "value_native": "Bữa trưa ăn cháo, ăn được một ít", "status": "needs_check", "evidence": "Bữa trưa bà ăn cháo, ăn được một ít.", "reason": "\"조금\"은 제16호 섭취량(1 / 1/2이상 / 1/2미만) 중 하나로 정할 수 없음", "detail": {"meal_type": "죽"}}, {"item_key": "sleep", "value_ko": "어젯밤 잠을 잘 못 주무셨다고 말씀하심(본인 진술)", "value_native": "Bà nói tối qua bà ngủ không ngon", "status": "observed", "evidence": "Bà nói tối qua bà ngủ không ngon.", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "오른쪽 무릎이 아프다고 말씀하심", "value_native": "Bà nói đầu gối bên phải bị đau", "status": "observed", "evidence": "Bà nói đầu gối bên phải bị đau.", "reason": "", "detail": {}}, {"item_key": "medication", "value_ko": "점심 식사 후 약 드시는 것 확인함", "value_native": "Đã thấy bà uống thuốc sau bữa trưa", "status": "observed", "evidence": "Sau bữa trưa tôi thấy bà uống thuốc.", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "점심 죽 섭취. 어젯밤 잠을 잘 못 주무셨다고 하심. 오른쪽 무릎 통증 호소하심. 점심 식사 후 복약 확인함.", "value_native": "Bữa trưa ăn cháo. Bà nói tối qua ngủ không ngon. Bà kêu đau đầu gối phải. Đã xác nhận bà uống thuốc sau bữa trưa.", "status": "observed", "evidence": "Bữa trưa bà ăn cháo, ăn được một ít. Hôm nay tôi thay tã cho bà ba lần. Bà nói tối qua bà ngủ không ngon. Bà nói đầu gối bên phải bị đau. Sau bữa trưa tôi thấy bà uống thuốc.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "내일 오른쪽 무릎 상태 다시 확인", "value_native": "Ngày mai kiểm tra lại đầu gối phải", "status": "observed", "evidence": "Ngày mai chắc phải xem lại đầu gối của bà.", "reason": "", "detail": {}}]$j$::jsonb, $j${}$j$::jsonb, null, null, 'approved', null, null, 'S-F05');
  perform pg_temp.demo_record('kim', 'worker', today - 1, '아침에 세수해 드리고 두 시간마다 자세 바꿨어요. 점심은 조금 드셨어요. Bà ngủ không ngon. 약은 드셨어요. 엉덩이 쪽이 조금 빨개요. 죽 반 안 되게 드셨어요.', '아침에 세수해 드리고 두 시간마다 자세 바꿨어요. 점심은 조금 드셨어요. 밤에 잘 못 주무셨어요. 약은 드셨어요. 엉덩이 쪽이 조금 빨개요.',
    $j$[{"item_key": "visit_time", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "support", "value_ko": "세면 도움, 체위변경(2시간마다)", "value_native": "Hỗ trợ rửa mặt, đổi tư thế (mỗi 2 giờ)", "status": "observed", "evidence": "아침에 세수해 드리고 두 시간마다 자세 바꿨어요.", "reason": "", "detail": {"checks": ["세면·구강청결·머리감기·몸단장·옷 갈아입기 도움 등", "체위변경(2시간마다)"]}}, {"item_key": "meal", "value_ko": "점심 죽 1/2 미만 드심.", "value_native": "Bữa trưa bà ăn cháo, dưới một nửa.", "status": "observed", "evidence": "죽 반 안 되게 드셨어요.", "reason": "", "detail": {"meal_type": "죽", "intake": "under_half"}}, {"item_key": "sleep", "value_ko": "밤에 잘 못 주무심", "value_native": "Đêm qua bà ngủ không ngon", "status": "observed", "evidence": "Bà ngủ không ngon.", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "엉덩이 쪽 피부가 조금 붉어 보임 (발적 관찰)", "value_native": "Da vùng mông hơi đỏ (quan sát thấy đỏ da)", "status": "needs_check", "evidence": "엉덩이 쪽이 조금 빨개요.", "reason": "피부 이상 신호(AI 규칙 '확인 필요' 4번: 건강·안전 신호). 관리자 확인과 간호인력 보고 필요. W3에 \"관리자에게 바로 알리세요\" 표시", "detail": {}}, {"item_key": "medication", "value_ko": "약 드신 것 확인함", "value_native": "Đã xác nhận bà uống thuốc", "status": "observed", "evidence": "약은 드셨어요.", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "점심 죽 1/2 미만 드심. 밤에 잘 못 주무심. 약 드신 것 확인함. 엉덩이 쪽 피부가 조금 붉어 보임.", "value_native": "Bữa trưa ăn cháo dưới một nửa. Đêm qua bà ngủ không ngon. Đã xác nhận bà uống thuốc. Da vùng mông hơi đỏ (cần người quản lý xác nhận).", "status": "observed", "evidence": "점심은 조금 드셨어요. Bà ngủ không ngon. 약은 드셨어요. 엉덩이 쪽이 조금 빨개요.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${}$j$::jsonb, null, null, 'approved', null, null, 'S-F01');
  perform pg_temp.demo_record('han', 'worker', today - 1, 'Sáng nay tôi rửa mặt và thay quần áo cho ông. Cứ hai tiếng tôi đổi tư thế cho ông, nhưng buổi chiều có một lần tôi làm hơi muộn. Chỗ bị loét tì đè ở mông hình như đỏ hơn hôm qua. Bữa trưa ông ăn đồ ăn xay sệt, ăn được khoảng một nửa. Trong lúc ăn ông ho hai lần. Tôi đổ túi nước tiểu ở bụng cho ông hai, ba lần. Màu nước tiểu giống như mọi khi. Hôm nay ông nhận ra tôi và cười.', '오늘 아침에 세수해 드리고 옷 갈아입혀 드렸어요. 자세는 두 시간마다 바꿔 드렸는데, 오후에 한 번은 조금 늦었어요. 엉덩이 욕창 있는 데가 어제보다 더 빨개진 것 같아요. 점심은 걸쭉하게 만든 거 반쯤 드셨어요. 드시다가 기침을 두 번 하셨어요. 배에 있는 소변 주머니는 두세 번 비워 드렸어요. 소변 색은 평소랑 비슷했어요. 오늘은 저를 알아보시고 웃으셨어요.',
    $j$[{"item_key": "visit_time", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "support", "value_ko": "세면·옷 갈아입기 도움, 체위변경(오후 1회 늦어짐), 요루 주머니 두세 번 비움", "value_native": "Hỗ trợ rửa mặt và thay quần áo, đổi tư thế (buổi chiều 1 lần bị muộn), đổ túi nước tiểu hai, ba lần", "status": "needs_check", "evidence": "Sáng nay tôi rửa mặt và thay quần áo cho ông. Cứ hai tiếng tôi đổi tư thế cho ông, nhưng buổi chiều có một lần tôi làm hơi muộn.", "reason": "① 체위변경(2시간마다) 칸은 2시간마다 제공한 경우에만 √ (유의사항 4). \"한 번 늦었다\"라 체크 여부를 관리자가 정함. ② \"두세 번\"은 화장실이용하기 횟수 하나로 정할 수 없음", "detail": {"checks": ["세면·구강청결·머리감기·몸단장·옷 갈아입기 도움 등", "체위변경(2시간마다)", "화장실이용하기(기저귀 교환)"], "reposition_delayed": 1}}, {"item_key": "meal", "value_ko": "점심 연하도움식(걸쭉하게 만든 식사)을 반쯤 드심. 식사 중 기침 2회", "value_native": "Bữa trưa ăn khoảng một nửa đồ ăn mềm cho người khó nuốt. Ho 2 lần trong lúc ăn", "status": "needs_check", "evidence": "Bữa trưa ông ăn đồ ăn xay sệt, ăn được khoảng một nửa. Trong lúc ăn ông ho hai lần.", "reason": "① 연하도움식은 제16호 식사 종류(일반식 / 죽 / 유동식) 선택지에 없음. 기관 기준으로 관리자가 고름 (용어 T40). ② \"반쯤\"은 1/2이상인지 1/2미만인지 정할 수 없음", "detail": {"meal_type_said": "연하도움식", "cough_during_meal": 2}}, {"item_key": "sleep", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "엉치 부위(등록된 욕창 부위)가 어제보다 더 붉어 보인다고 관찰함", "value_native": "Quan sát thấy vùng mông (chỗ loét tì đè đã đăng ký) có vẻ đỏ hơn hôm qua", "status": "needs_check", "evidence": "Chỗ bị loét tì đè ở mông hình như đỏ hơn hôm qua.", "reason": "\"어제보다 더\"는 비교 판단이라 이전 기록과 대조 필요. 피부 상태 변화라 간호인력 보고 여부 확인 (용어 T32: 관찰 표현 + 관리자에게 먼저 보고). 욕창 단계·악화 판정은 쓰지 않음", "detail": {}}, {"item_key": "medication", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "작성자를 알아보시고 웃으심", "value_native": "Ông nhận ra người chăm sóc và cười", "status": "observed", "evidence": "Hôm nay ông nhận ra tôi và cười.", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "체위변경 오후 1회 늦어짐. 엉치 부위(등록된 욕창 부위)가 어제보다 붉어 보임. 점심 연하도움식 섭취, 식사 중 기침 2회. 요루 주머니 비움, 소변 색 평소와 비슷하다고 함.", "value_native": "Đổi tư thế buổi chiều 1 lần bị muộn. Vùng mông (chỗ loét tì đè đã đăng ký) có vẻ đỏ hơn hôm qua. Bữa trưa ăn đồ ăn mềm, ho 2 lần trong lúc ăn. Đã đổ túi nước tiểu, màu nước tiểu giống mọi khi.", "status": "observed", "evidence": "Cứ hai tiếng tôi đổi tư thế cho ông, nhưng buổi chiều có một lần tôi làm hơi muộn. Chỗ bị loét tì đè ở mông hình như đỏ hơn hôm qua. Bữa trưa ông ăn đồ ăn xay sệt, ăn được khoảng một nửa. Trong lúc ăn ông ho hai lần. Tôi đổ túi nước tiểu ở bụng cho ông hai, ba lần. Màu nước tiểu giống như mọi khi.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${}$j$::jsonb, null, null, 'submitted', null, null, 'S-F02');
  perform pg_temp.demo_record('kang', 'worker', today - 3, '새벽 다섯 시쯤 화장실 가시다가 침대 옆에서 넘어지셨어요. 오른쪽 손목이 아프다고 하셨어요. 바로 간호사님께 알렸어요. 아침은 일반식으로 다 드셨어요. 오후에 휠체어로 산책 같이 했어요.', '새벽 다섯 시쯤 화장실 가시다가 침대 옆에서 넘어지셨어요. 오른쪽 손목이 아프다고 하셨어요. 바로 간호사님께 알렸어요. 아침은 일반식으로 다 드셨어요. 오후에 휠체어로 산책 같이 했어요.',
    $j$[{"item_key": "visit_time", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "support", "value_ko": "산책 동행(휠체어)", "value_native": "Đi dạo cùng (xe lăn)", "status": "observed", "evidence": "오후에 휠체어로 산책 같이 했어요.", "reason": "", "detail": {"checks": ["산책 동행"]}}, {"item_key": "meal", "value_ko": "아침 일반식 전량 섭취", "value_native": "Bữa sáng ăn hết suất cơm thường", "status": "observed", "evidence": "아침은 일반식으로 다 드셨어요.", "reason": "", "detail": {"meal_type": "일반식", "intake": "full"}}, {"item_key": "sleep", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "새벽 5시경 화장실 가시다 침대 옆에서 넘어지심. 오른쪽 손목이 아프다고 하심", "value_native": "Khoảng 5 giờ sáng ngã cạnh giường khi đi vệ sinh. Ông/bà nói cổ tay phải bị đau", "status": "needs_check", "evidence": "새벽 다섯 시쯤 화장실 가시다가 침대 옆에서 넘어지셨어요. 오른쪽 손목이 아프다고 하셨어요.", "reason": "건강·안전 신호(낙상·통증, 용어 T29: 관리자에게 먼저 보고). 작성자가 간호인력에게 알렸다고 함 → 관리자 확인", "detail": {}}, {"item_key": "medication", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "새벽 5시경 화장실 가시다 침대 옆에서 넘어지심. 오른쪽 손목이 아프다고 하심. 간호인력에게 바로 알림. 아침 일반식 전량 섭취. 오후 휠체어로 산책함.", "value_native": "Khoảng 5 giờ sáng ngã cạnh giường khi đi vệ sinh. Nói cổ tay phải bị đau. Đã báo ngay cho điều dưỡng. Bữa sáng ăn hết. Buổi chiều đi dạo bằng xe lăn.", "status": "observed", "evidence": "새벽 다섯 시쯤 화장실 가시다가 침대 옆에서 넘어지셨어요. 오른쪽 손목이 아프다고 하셨어요. 바로 간호사님께 알렸어요. 아침은 일반식으로 다 드셨어요. 오후에 휠체어로 산책 같이 했어요.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${}$j$::jsonb, null, null, 'approved', null, null, 'S-F03');
  perform pg_temp.demo_record('kang', 'worker', today - 1, '새벽 다섯 시쯤 화장실 가시다가 침대 옆에서 넘어지셨어요. 오른쪽 손목이 아프다고 하셨어요. 바로 간호사님께 알렸어요. 아침은 일반식으로 다 드셨어요. 오후에 휠체어로 산책 같이 했어요.', '새벽 다섯 시쯤 화장실 가시다가 침대 옆에서 넘어지셨어요. 오른쪽 손목이 아프다고 하셨어요. 바로 간호사님께 알렸어요. 아침은 일반식으로 다 드셨어요. 오후에 휠체어로 산책 같이 했어요.',
    null, $j${}$j$::jsonb, null, null, 'draft', null, null, 'S-F03');
  perform pg_temp.demo_record('seo', 'worker', today - 3, '오늘 할매가 아침부터 걸신져가 밥을 두 그릇이나 자셨어예. 낮에 자꾸 집에 간다꼬 문 앞을 왔다갔다 하시데예. 기저귀는 세 번 갈았심더. 저녁에 쪼매 일찍 주무셨어예.', '오늘 할매가 아침부터 걸신져가 밥을 두 그릇이나 자셨어예. 낮에 자꾸 집에 간다꼬 문 앞을 왔다갔다 하시데예. 기저귀는 세 번 갈았심더. 저녁에 쪼매 일찍 주무셨어예.',
    $j$[{"item_key": "visit_time", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "support", "value_ko": "기저귀 교환 3회", "value_native": "Thay tã 3 lần", "status": "observed", "evidence": "기저귀는 세 번 갈았심더.", "reason": "", "detail": {"checks": ["화장실이용하기(기저귀 교환)"], "toilet_count": 3}}, {"item_key": "meal", "value_ko": "아침 밥을 두 그릇 드심", "value_native": "Bữa sáng ăn hai bát cơm", "status": "needs_check", "evidence": "오늘 할매가 아침부터 걸신져가 밥을 두 그릇이나 자셨어예.", "reason": "사투리 '걸신지다'를 '많이 드시다'로 짐작(용어 목록에 없음, AI 규칙 '확인 필요' 2번 예시). 두 그릇을 섭취량 1(전량)로 둘지 확인", "detail": {"meal_type": "일반식"}}, {"item_key": "sleep", "value_ko": "저녁에 조금 일찍 주무심", "value_native": "Buổi tối ngủ sớm hơn một chút", "status": "needs_check", "evidence": "저녁에 쪼매 일찍 주무셨어예.", "reason": "사투리 '쪼매'를 '조금'으로 짐작", "detail": {}}, {"item_key": "discomfort", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "medication", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "낮에 집에 간다고 하시며 문 앞을 여러 번 오가심(배회)", "value_native": "Ban ngày nói muốn về nhà và đi tới đi lui trước cửa nhiều lần", "status": "observed", "evidence": "낮에 자꾸 집에 간다꼬 문 앞을 왔다갔다 하시데예.", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "아침 밥 두 그릇 드심. 낮에 집에 간다며 문 앞을 여러 번 오가심. 기저귀 3회 교환. 저녁에 조금 일찍 주무심.", "value_native": "Bữa sáng ăn hai bát. Ban ngày đi tới đi lui trước cửa, nói muốn về nhà. Thay tã 3 lần. Buổi tối ngủ sớm hơn một chút.", "status": "observed", "evidence": "오늘 할매가 아침부터 걸신져가 밥을 두 그릇이나 자셨어예. 낮에 자꾸 집에 간다꼬 문 앞을 왔다갔다 하시데예. 기저귀는 세 번 갈았심더. 저녁에 쪼매 일찍 주무셨어예.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${}$j$::jsonb, null, null, 'submitted_late', null, null, 'S-F04');
  perform pg_temp.demo_record('park', 'worker', today - 2, 'Sáng nay tôi rửa mặt và thay quần áo cho bà. Cứ hai tiếng tôi đổi tư thế cho bà một lần. Bữa trưa bà ăn cháo, ăn được một ít. Hôm nay tôi thay tã cho bà ba lần. Bà nói tối qua bà ngủ không ngon. Bà nói đầu gối bên phải bị đau. Sau bữa trưa tôi thấy bà uống thuốc. Ngày mai chắc phải xem lại đầu gối của bà.', '아침에 세수해 드리고 옷 갈아입혀 드렸어요. 두 시간마다 자세 바꿔 드렸어요. 점심은 죽으로 조금 드셨어요. 오늘 기저귀는 세 번 갈아 드렸어요. 어젯밤에 잠을 잘 못 주무셨다고 하셨어요. 오른쪽 무릎이 아프다고 하셨어요. 점심 드시고 약 드시는 거 봤어요. 내일 무릎 다시 봐야 할 것 같아요.',
    $j$[{"item_key": "visit_time", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "support", "value_ko": "세면·옷 갈아입기 도움, 체위변경(2시간마다), 기저귀 교환 3회", "value_native": "Hỗ trợ rửa mặt và thay quần áo, đổi tư thế (mỗi 2 giờ), thay tã 3 lần", "status": "observed", "evidence": "Sáng nay tôi rửa mặt và thay quần áo cho bà. Cứ hai tiếng tôi đổi tư thế cho bà một lần.", "reason": "", "detail": {"checks": ["세면·구강청결·머리감기·몸단장·옷 갈아입기 도움 등", "체위변경(2시간마다)", "화장실이용하기(기저귀 교환)"], "toilet_count": 3}}, {"item_key": "meal", "value_ko": "점심 죽을 조금 드심", "value_native": "Bữa trưa ăn cháo, ăn được một ít", "status": "needs_check", "evidence": "Bữa trưa bà ăn cháo, ăn được một ít.", "reason": "\"조금\"은 제16호 섭취량(1 / 1/2이상 / 1/2미만) 중 하나로 정할 수 없음", "detail": {"meal_type": "죽"}}, {"item_key": "sleep", "value_ko": "어젯밤 잠을 잘 못 주무셨다고 말씀하심(본인 진술)", "value_native": "Bà nói tối qua bà ngủ không ngon", "status": "observed", "evidence": "Bà nói tối qua bà ngủ không ngon.", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "오른쪽 무릎이 아프다고 말씀하심", "value_native": "Bà nói đầu gối bên phải bị đau", "status": "observed", "evidence": "Bà nói đầu gối bên phải bị đau.", "reason": "", "detail": {}}, {"item_key": "medication", "value_ko": "점심 식사 후 약 드시는 것 확인함", "value_native": "Đã thấy bà uống thuốc sau bữa trưa", "status": "observed", "evidence": "Sau bữa trưa tôi thấy bà uống thuốc.", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "점심 죽 섭취. 어젯밤 잠을 잘 못 주무셨다고 하심. 오른쪽 무릎 통증 호소하심. 점심 식사 후 복약 확인함.", "value_native": "Bữa trưa ăn cháo. Bà nói tối qua ngủ không ngon. Bà kêu đau đầu gối phải. Đã xác nhận bà uống thuốc sau bữa trưa.", "status": "observed", "evidence": "Bữa trưa bà ăn cháo, ăn được một ít. Hôm nay tôi thay tã cho bà ba lần. Bà nói tối qua bà ngủ không ngon. Bà nói đầu gối bên phải bị đau. Sau bữa trưa tôi thấy bà uống thuốc.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "내일 오른쪽 무릎 상태 다시 확인", "value_native": "Ngày mai kiểm tra lại đầu gối phải", "status": "observed", "evidence": "Ngày mai chắc phải xem lại đầu gối của bà.", "reason": "", "detail": {}}]$j$::jsonb, $j${}$j$::jsonb, null, null, 'returned', '점심 섭취량을 1/2이상·1/2미만 중 하나로 확인해 적어 주세요.', 'Vui lòng xác nhận lượng ăn bữa trưa là trên 1/2 hay dưới 1/2 rồi ghi lại.', 'S-F05');
  perform pg_temp.demo_record('lee', 'worker', pg_temp.visit_day('lee', 1), '두 시부터 다섯 시까지 있었어요. 목욕 도와드리고 청소했어요. 한 시간 동안 이야기 나눴는데 오늘이 며칠인지 두 번 물어보셨어요.', '두 시부터 다섯 시까지 있었어요. 목욕 도와드리고 청소했어요. 한 시간 동안 이야기 나눴는데 오늘이 며칠인지 두 번 물어보셨어요.',
    $j$[{"item_key": "visit_time", "value_ko": "14:00~17:00 방문 (180분)", "value_native": "Thăm từ 14:00 đến 17:00 (180 phút)", "status": "observed", "evidence": "두 시부터 다섯 시까지 있었어요.", "reason": "", "detail": {"start": "14:00", "end": "17:00"}}, {"item_key": "support", "value_ko": "몸 씻기 도움(목욕), 청소, 말벗 1시간", "value_native": "Hỗ trợ tắm, dọn dẹp, trò chuyện 1 giờ", "status": "observed", "evidence": "목욕 도와드리고 청소했어요. 한 시간 동안 이야기 나눴는데", "reason": "", "detail": {"checks": ["몸 씻기 도움", "식사준비, 청소 및 주변정리 정돈, 세탁 등"], "minutes": {"physical": 60, "housework": 60, "emotional": 60}}}, {"item_key": "meal", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "sleep", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "medication", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "오늘 날짜를 두 번 물으심", "value_native": "Hỏi ngày hôm nay hai lần", "status": "needs_check", "evidence": "오늘이 며칠인지 두 번 물어보셨어요.", "reason": "비교 표현이 없어 인지기능 변화상태(호전/유지/악화)를 정할 수 없음 (AI 규칙 쓰기 원칙 2)", "detail": {"trend": "same"}}, {"item_key": "notes", "value_ko": "목욕 도움, 청소함. 1시간 말벗하는 동안 오늘 날짜를 두 번 물으심.", "value_native": "Hỗ trợ tắm, dọn dẹp. Trong 1 giờ trò chuyện, hỏi ngày hôm nay hai lần.", "status": "observed", "evidence": "목욕 도와드리고 청소했어요. 한 시간 동안 이야기 나눴는데 오늘이 며칠인지 두 번 물어보셨어요.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${"total_minutes": 180, "cognition_trend": "same"}$j$::jsonb, '14:00', '17:00', 'approved', null, null, 'S-H01');
  perform pg_temp.demo_record('jeong', 'worker', pg_temp.visit_day('jeong', 1), '아홉 시부터 열두 시까지 있었어요. Hôm nay ông nói bị chóng mặt. 박 사회복지사님께 전화로 말씀드렸어요. 점심 준비해 드리고 빨래했어요. 식사는 반 정도 드셨어요.', '아홉 시부터 열두 시까지 있었어요. 오늘 어르신이 어지럽다고 하셨어요. 박 사회복지사님께 전화로 말씀드렸어요. 점심 준비해 드리고 빨래했어요. 식사는 반 정도 드셨어요.',
    $j$[{"item_key": "visit_time", "value_ko": "09:00~12:00 방문 (180분)", "value_native": "Thăm từ 09:00 đến 12:00 (180 phút)", "status": "observed", "evidence": "아홉 시부터 열두 시까지 있었어요.", "reason": "", "detail": {"start": "09:00", "end": "12:00"}}, {"item_key": "support", "value_ko": "점심 식사 준비, 세탁", "value_native": "Chuẩn bị bữa trưa, giặt đồ", "status": "observed", "evidence": "점심 준비해 드리고 빨래했어요.", "reason": "", "detail": {"checks": ["식사준비, 청소 및 주변정리 정돈, 세탁 등"]}}, {"item_key": "meal", "value_ko": "점심 반 정도 드심", "value_native": "Bữa trưa ăn khoảng một nửa", "status": "observed", "evidence": "식사는 반 정도 드셨어요.", "reason": "", "detail": {}}, {"item_key": "sleep", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "어지럽다고 말씀하심", "value_native": "Ông nói bị chóng mặt", "status": "needs_check", "evidence": "Hôm nay ông nói bị chóng mặt.", "reason": "건강·안전 신호(현기증, 용어 T42). 작성자가 관리자에게 전화했다고 함 → 관리자 확인", "detail": {}}, {"item_key": "medication", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "어지럽다고 말씀하셔서 관리자에게 전화로 알림. 점심 식사 준비, 세탁함. 점심 반 정도 드심.", "value_native": "Ông nói bị chóng mặt nên đã gọi điện báo người quản lý. Chuẩn bị bữa trưa, giặt đồ. Bữa trưa ăn khoảng một nửa.", "status": "observed", "evidence": "Hôm nay ông nói bị chóng mặt. 박 사회복지사님께 전화로 말씀드렸어요. 점심 준비해 드리고 빨래했어요. 식사는 반 정도 드셨어요.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${"total_minutes": 180}$j$::jsonb, '09:00', '12:00', 'submitted', null, null, 'S-H02');
  perform pg_temp.demo_record('yoon', 'worker', pg_temp.visit_day('yoon', 1), '세 시부터 여섯 시까지 있었어요. 지난주보다 걷는 게 훨씬 좋아지셨어요. 같이 동네 한 바퀴 산책했어요. Bà ăn hết bữa xế như mọi khi. 같이 그림 색칠하기 한 시간 했어요.', '세 시부터 여섯 시까지 있었어요. 지난주보다 걷는 게 훨씬 좋아지셨어요. 같이 동네 한 바퀴 산책했어요. 오후 간식을 평소처럼 다 드셨어요. 같이 그림 색칠하기 한 시간 했어요.',
    $j$[{"item_key": "visit_time", "value_ko": "15:00~18:00 방문 (180분)", "value_native": "Thăm từ 15:00 đến 18:00 (180 phút)", "status": "observed", "evidence": "세 시부터 여섯 시까지 있었어요.", "reason": "", "detail": {"start": "15:00", "end": "18:00"}}, {"item_key": "support", "value_ko": "보행 도움(동네 산책), 인지자극활동(그림 색칠하기) 1시간", "value_native": "Hỗ trợ đi bộ (dạo quanh xóm), hoạt động kích thích nhận thức (tô màu) 1 giờ", "status": "observed", "evidence": "같이 동네 한 바퀴 산책했어요.", "reason": "", "detail": {"checks": ["이동 도움(보행, 보장구사용 등 도움)"], "minutes": {"cognitive_stimulation": 60}}}, {"item_key": "meal", "value_ko": "오후 간식을 평소처럼 다 드심 (식사기능 유지)", "value_native": "Ăn hết bữa xế như mọi khi", "status": "observed", "evidence": "Bà ăn hết bữa xế như mọi khi.", "reason": "", "detail": {"trend": "same"}}, {"item_key": "sleep", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "지난주보다 걷기가 훨씬 좋아지심 (신체기능 호전)", "value_native": "Đi lại tốt hơn nhiều so với tuần trước", "status": "observed", "evidence": "지난주보다 걷는 게 훨씬 좋아지셨어요.", "reason": "", "detail": {"trend": "improved"}}, {"item_key": "medication", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "지난주보다 걷기가 좋아지심. 동네 한 바퀴 산책함. 오후 간식 평소처럼 다 드심. 그림 색칠하기 1시간 함.", "value_native": "Đi lại tốt hơn tuần trước. Đi dạo quanh xóm. Ăn hết bữa xế như mọi khi. Tô màu 1 giờ.", "status": "observed", "evidence": "지난주보다 걷는 게 훨씬 좋아지셨어요. 같이 동네 한 바퀴 산책했어요. Bà ăn hết bữa xế như mọi khi. 같이 그림 색칠하기 한 시간 했어요.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${"total_minutes": 180, "body_trend": "improved", "meal_trend": "same"}$j$::jsonb, '15:00', '18:00', 'submitted', null, null, 'S-H03');
  perform pg_temp.demo_record('jang', 'worker', pg_temp.visit_day('jang', 1), '열 시부터 한 시까지 있었심더. 오늘 할매가 영 기운이 없으시데예. 밥은 쪼매밖에 안 잡수셨어예. 기저귀 두 번 갈았는데 대변 실수 한 번, 소변 실수 두 번 하셨어예. 기저귀 닿는 데가 쪼매 빨갛데예.', '열 시부터 한 시까지 있었심더. 오늘 할매가 영 기운이 없으시데예. 밥은 쪼매밖에 안 잡수셨어예. 기저귀 두 번 갈았는데 대변 실수 한 번, 소변 실수 두 번 하셨어예. 기저귀 닿는 데가 쪼매 빨갛데예.',
    $j$[{"item_key": "visit_time", "value_ko": "10:00~13:00 방문 (180분)", "value_native": "Thăm từ 10:00 đến 13:00 (180 phút)", "status": "observed", "evidence": "열 시부터 한 시까지 있었심더.", "reason": "", "detail": {"start": "10:00", "end": "13:00"}}, {"item_key": "support", "value_ko": "기저귀 교환 2회, 대변 실수 1회·소변 실수 2회", "value_native": "Thay tã 2 lần, đại tiện không tự chủ 1 lần, tiểu tiện không tự chủ 2 lần", "status": "needs_check", "evidence": "기저귀 두 번 갈았는데 대변 실수 한 번, 소변 실수 두 번 하셨어예.", "reason": "제12호 배변변화 칸은 '기저귀 사용 시 교환 횟수'를 적는데, 교환 2회와 실수 3회(대변 1·소변 2)가 달라 어느 값을 적을지 정할 수 없음", "detail": {"checks": ["화장실이용하기"], "diaper_changes": 2, "stool_said": 1, "urine_said": 2}}, {"item_key": "meal", "value_ko": "점심 조금 드심", "value_native": "Bữa trưa ăn một ít", "status": "needs_check", "evidence": "밥은 쪼매밖에 안 잡수셨어예.", "reason": "사투리 '쪼매'를 '조금'으로 짐작(용어 목록에 없음). 양도 모호함", "detail": {}}, {"item_key": "sleep", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "기저귀 닿는 부위가 조금 붉어 보임(발적 관찰). 기운이 없어 보이심", "value_native": "Vùng tiếp xúc với tã hơi đỏ (quan sát thấy đỏ da). Trông ông bà mệt mỏi", "status": "needs_check", "evidence": "기저귀 닿는 데가 쪼매 빨갛데예.", "reason": "피부 이상 신호(건강·안전 신호, 용어 T38 기저귀피부염은 관찰 표현으로). '쪼매'는 '조금'으로 짐작", "detail": {}}, {"item_key": "medication", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "기운이 없어 보이심. 점심 조금 드심. 기저귀 2회 교환, 대변 실수 1회·소변 실수 2회. 기저귀 닿는 부위가 조금 붉어 보임.", "value_native": "Trông mệt mỏi. Bữa trưa ăn một ít. Thay tã 2 lần, đại tiện không tự chủ 1 lần, tiểu tiện không tự chủ 2 lần. Vùng tiếp xúc với tã hơi đỏ.", "status": "observed", "evidence": "오늘 할매가 영 기운이 없으시데예. 밥은 쪼매밖에 안 잡수셨어예. 기저귀 두 번 갈았는데 대변 실수 한 번, 소변 실수 두 번 하셨어예. 기저귀 닿는 데가 쪼매 빨갛데예.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${"total_minutes": 180, "stool_accidents": null, "urine_accidents": null}$j$::jsonb, '10:00', '13:00', 'resent', '기저귀 교환 횟수와 실수 횟수 중 어느 값을 배변 칸에 적을지 다시 확인해 주세요.', 'Vui lòng kiểm tra lại nên ghi số lần thay tã hay số lần không tự chủ vào ô đại tiểu tiện.', 'S-H04');
  perform pg_temp.demo_record('oh', 'worker', pg_temp.visit_day('oh', 1), '한 시부터 네 시까지 있었어요. 식탁에 아침 약이 그대로 있었어요. 아침 약을 안 드신 것 같아요. 평소처럼 신문 보시고 날짜도 잘 말씀하셨어요. 반찬 만들어 드리고 청소했어요.', '한 시부터 네 시까지 있었어요. 식탁에 아침 약이 그대로 있었어요. 아침 약을 안 드신 것 같아요. 평소처럼 신문 보시고 날짜도 잘 말씀하셨어요. 반찬 만들어 드리고 청소했어요.',
    $j$[{"item_key": "visit_time", "value_ko": "13:00~16:00 방문 (180분)", "value_native": "Thăm từ 13:00 đến 16:00 (180 phút)", "status": "observed", "evidence": "한 시부터 네 시까지 있었어요.", "reason": "", "detail": {"start": "13:00", "end": "16:00"}}, {"item_key": "support", "value_ko": "반찬 만들기, 청소", "value_native": "Làm món ăn kèm, dọn dẹp", "status": "observed", "evidence": "반찬 만들어 드리고 청소했어요.", "reason": "", "detail": {"checks": ["식사준비, 청소 및 주변정리 정돈, 세탁 등"]}}, {"item_key": "meal", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "sleep", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "medication", "value_ko": "식탁에 아침 약이 그대로 있어 드시지 않은 것으로 보임", "value_native": "Thuốc buổi sáng vẫn còn trên bàn, có vẻ chưa uống", "status": "needs_check", "evidence": "식탁에 아침 약이 그대로 있었어요. 아침 약을 안 드신 것 같아요.", "reason": "건강·안전 신호(약을 안 드신 경우, AI 규칙 '확인 필요' 4번). 관리자에게 바로 알림. 작성자 추측('것 같아요')", "detail": {}}, {"item_key": "cognition", "value_ko": "평소처럼 신문 보시고 날짜를 잘 말씀하심 (인지기능 유지)", "value_native": "Đọc báo như mọi khi và nói đúng ngày", "status": "observed", "evidence": "평소처럼 신문 보시고 날짜도 잘 말씀하셨어요.", "reason": "", "detail": {"trend": "same"}}, {"item_key": "notes", "value_ko": "식탁에 아침 약이 그대로 있어 드시지 않은 것으로 보임(관리자에게 알림 필요). 평소처럼 신문 보시고 날짜를 잘 말씀하심. 반찬 만들기, 청소함.", "value_native": "Thuốc buổi sáng vẫn còn trên bàn, có vẻ chưa uống (cần báo người quản lý). Đọc báo như mọi khi và nói đúng ngày. Làm món ăn kèm, dọn dẹp.", "status": "observed", "evidence": "식탁에 아침 약이 그대로 있었어요. 아침 약을 안 드신 것 같아요. 평소처럼 신문 보시고 날짜도 잘 말씀하셨어요. 반찬 만들어 드리고 청소했어요.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${"total_minutes": 180, "cognition_trend": "same"}$j$::jsonb, '13:00', '16:00', 'approved', null, null, 'S-H05');
  perform pg_temp.demo_record('choi', 'trainee', today - 2, 'Sáng nay tôi rửa mặt và thay quần áo cho bà. Cứ hai tiếng tôi đổi tư thế cho bà một lần. Bữa trưa bà ăn cháo, ăn được một ít. Hôm nay tôi thay tã cho bà ba lần. Bà nói tối qua bà ngủ không ngon. Bà nói đầu gối bên phải bị đau. Sau bữa trưa tôi thấy bà uống thuốc. Ngày mai chắc phải xem lại đầu gối của bà.', '아침에 세수해 드리고 옷 갈아입혀 드렸어요. 두 시간마다 자세 바꿔 드렸어요. 점심은 죽으로 조금 드셨어요. 오늘 기저귀는 세 번 갈아 드렸어요. 어젯밤에 잠을 잘 못 주무셨다고 하셨어요. 오른쪽 무릎이 아프다고 하셨어요. 점심 드시고 약 드시는 거 봤어요. 내일 무릎 다시 봐야 할 것 같아요.',
    $j$[{"item_key": "visit_time", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "support", "value_ko": "세면·옷 갈아입기 도움, 체위변경(2시간마다), 기저귀 교환 3회", "value_native": "Hỗ trợ rửa mặt và thay quần áo, đổi tư thế (mỗi 2 giờ), thay tã 3 lần", "status": "observed", "evidence": "Sáng nay tôi rửa mặt và thay quần áo cho bà. Cứ hai tiếng tôi đổi tư thế cho bà một lần.", "reason": "", "detail": {"checks": ["세면·구강청결·머리감기·몸단장·옷 갈아입기 도움 등", "체위변경(2시간마다)", "화장실이용하기(기저귀 교환)"], "toilet_count": 3}}, {"item_key": "meal", "value_ko": "점심 죽을 조금 드심", "value_native": "Bữa trưa ăn cháo, ăn được một ít", "status": "needs_check", "evidence": "Bữa trưa bà ăn cháo, ăn được một ít.", "reason": "\"조금\"은 제16호 섭취량(1 / 1/2이상 / 1/2미만) 중 하나로 정할 수 없음", "detail": {"meal_type": "죽"}}, {"item_key": "sleep", "value_ko": "어젯밤 잠을 잘 못 주무셨다고 말씀하심(본인 진술)", "value_native": "Bà nói tối qua bà ngủ không ngon", "status": "observed", "evidence": "Bà nói tối qua bà ngủ không ngon.", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "오른쪽 무릎이 아프다고 말씀하심", "value_native": "Bà nói đầu gối bên phải bị đau", "status": "observed", "evidence": "Bà nói đầu gối bên phải bị đau.", "reason": "", "detail": {}}, {"item_key": "medication", "value_ko": "점심 식사 후 약 드시는 것 확인함", "value_native": "Đã thấy bà uống thuốc sau bữa trưa", "status": "observed", "evidence": "Sau bữa trưa tôi thấy bà uống thuốc.", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "점심 죽 섭취. 어젯밤 잠을 잘 못 주무셨다고 하심. 오른쪽 무릎 통증 호소하심. 점심 식사 후 복약 확인함.", "value_native": "Bữa trưa ăn cháo. Bà nói tối qua ngủ không ngon. Bà kêu đau đầu gối phải. Đã xác nhận bà uống thuốc sau bữa trưa.", "status": "observed", "evidence": "Bữa trưa bà ăn cháo, ăn được một ít. Hôm nay tôi thay tã cho bà ba lần. Bà nói tối qua bà ngủ không ngon. Bà nói đầu gối bên phải bị đau. Sau bữa trưa tôi thấy bà uống thuốc.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "내일 오른쪽 무릎 상태 다시 확인", "value_native": "Ngày mai kiểm tra lại đầu gối phải", "status": "observed", "evidence": "Ngày mai chắc phải xem lại đầu gối của bà.", "reason": "", "detail": {}}]$j$::jsonb, $j${}$j$::jsonb, null, null, 'approved', null, null, 'S-F05');
  perform pg_temp.demo_record('choi', 'trainee', today - 1, 'Sáng nay tôi rửa mặt và thay quần áo cho ông. Cứ hai tiếng tôi đổi tư thế cho ông, nhưng buổi chiều có một lần tôi làm hơi muộn. Chỗ bị loét tì đè ở mông hình như đỏ hơn hôm qua. Bữa trưa ông ăn đồ ăn xay sệt, ăn được khoảng một nửa. Trong lúc ăn ông ho hai lần. Tôi đổ túi nước tiểu ở bụng cho ông hai, ba lần. Màu nước tiểu giống như mọi khi. Hôm nay ông nhận ra tôi và cười.', '오늘 아침에 세수해 드리고 옷 갈아입혀 드렸어요. 자세는 두 시간마다 바꿔 드렸는데, 오후에 한 번은 조금 늦었어요. 엉덩이 욕창 있는 데가 어제보다 더 빨개진 것 같아요. 점심은 걸쭉하게 만든 거 반쯤 드셨어요. 드시다가 기침을 두 번 하셨어요. 배에 있는 소변 주머니는 두세 번 비워 드렸어요. 소변 색은 평소랑 비슷했어요. 오늘은 저를 알아보시고 웃으셨어요.',
    $j$[{"item_key": "visit_time", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "support", "value_ko": "세면·옷 갈아입기 도움, 체위변경(오후 1회 늦어짐), 요루 주머니 두세 번 비움", "value_native": "Hỗ trợ rửa mặt và thay quần áo, đổi tư thế (buổi chiều 1 lần bị muộn), đổ túi nước tiểu hai, ba lần", "status": "needs_check", "evidence": "Sáng nay tôi rửa mặt và thay quần áo cho ông. Cứ hai tiếng tôi đổi tư thế cho ông, nhưng buổi chiều có một lần tôi làm hơi muộn.", "reason": "① 체위변경(2시간마다) 칸은 2시간마다 제공한 경우에만 √ (유의사항 4). \"한 번 늦었다\"라 체크 여부를 강사가 정함. ② \"두세 번\"은 화장실이용하기 횟수 하나로 정할 수 없음", "detail": {"checks": ["세면·구강청결·머리감기·몸단장·옷 갈아입기 도움 등", "체위변경(2시간마다)", "화장실이용하기(기저귀 교환)"], "reposition_delayed": 1}}, {"item_key": "meal", "value_ko": "점심 연하도움식(걸쭉하게 만든 식사)을 반쯤 드심. 식사 중 기침 2회", "value_native": "Bữa trưa ăn khoảng một nửa đồ ăn mềm cho người khó nuốt. Ho 2 lần trong lúc ăn", "status": "needs_check", "evidence": "Bữa trưa ông ăn đồ ăn xay sệt, ăn được khoảng một nửa. Trong lúc ăn ông ho hai lần.", "reason": "① 연하도움식은 제16호 식사 종류(일반식 / 죽 / 유동식) 선택지에 없음. 기관 기준으로 강사가 고름 (용어 T40). ② \"반쯤\"은 1/2이상인지 1/2미만인지 정할 수 없음", "detail": {"meal_type_said": "연하도움식", "cough_during_meal": 2}}, {"item_key": "sleep", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "discomfort", "value_ko": "엉치 부위(등록된 욕창 부위)가 어제보다 더 붉어 보인다고 관찰함", "value_native": "Quan sát thấy vùng mông (chỗ loét tì đè đã đăng ký) có vẻ đỏ hơn hôm qua", "status": "needs_check", "evidence": "Chỗ bị loét tì đè ở mông hình như đỏ hơn hôm qua.", "reason": "\"어제보다 더\"는 비교 판단이라 이전 기록과 대조 필요. 피부 상태 변화라 간호인력 보고 여부 확인 (용어 T32: 관찰 표현 + 강사에게 먼저 보고). 욕창 단계·악화 판정은 쓰지 않음", "detail": {}}, {"item_key": "medication", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}, {"item_key": "cognition", "value_ko": "작성자를 알아보시고 웃으심", "value_native": "Ông nhận ra người chăm sóc và cười", "status": "observed", "evidence": "Hôm nay ông nhận ra tôi và cười.", "reason": "", "detail": {}}, {"item_key": "notes", "value_ko": "체위변경 오후 1회 늦어짐. 엉치 부위(등록된 욕창 부위)가 어제보다 붉어 보임. 점심 연하도움식 섭취, 식사 중 기침 2회. 요루 주머니 비움, 소변 색 평소와 비슷하다고 함.", "value_native": "Đổi tư thế buổi chiều 1 lần bị muộn. Vùng mông (chỗ loét tì đè đã đăng ký) có vẻ đỏ hơn hôm qua. Bữa trưa ăn đồ ăn mềm, ho 2 lần trong lúc ăn. Đã đổ túi nước tiểu, màu nước tiểu giống mọi khi.", "status": "observed", "evidence": "Cứ hai tiếng tôi đổi tư thế cho ông, nhưng buổi chiều có một lần tôi làm hơi muộn. Chỗ bị loét tì đè ở mông hình như đỏ hơn hôm qua. Bữa trưa ông ăn đồ ăn xay sệt, ăn được khoảng một nửa. Trong lúc ăn ông ho hai lần. Tôi đổ túi nước tiểu ở bụng cho ông hai, ba lần. Màu nước tiểu giống như mọi khi.", "reason": "", "detail": {}}, {"item_key": "next_check", "value_ko": "", "value_native": "", "status": "not_mentioned", "evidence": "", "reason": "", "detail": {}}]$j$::jsonb, $j${}$j$::jsonb, null, null, 'submitted', null, null, 'S-F02');
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
