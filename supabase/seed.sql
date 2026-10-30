-- 데모 데이터: 기관 2개, 합성 어르신 3명, 계정 4개(기관마다 작성자 1·관리자 1), 담당 연결 3개
-- 근거: 문서/설계/시연-일정-v1.1.md '시연 준비물', 시나리오 1~3
-- 합성 사례만 씁니다. 어르신·가족 실명 금지(AGENTS.md 원칙 9). 사람 이름은 시나리오의 가상 인물입니다.
--
-- 로컬(supabase db reset): 계정이 없으면 아래 비밀번호로 만듭니다. 로컬 전용입니다.
-- 클라우드: 대시보드 Authentication에서 아래 이메일로 계정을 먼저 만들고(비밀번호는 팀 비공개),
--           SQL Editor에서 이 파일을 돌리면 계정은 건너뛰고 프로필·기관·어르신만 넣습니다.
-- 여러 번 돌려도 같은 결과입니다.

-- ── 기관 ─────────────────────────────────────────────────
insert into public.organizations (id, name, is_training) values
  ('00000000-0000-4000-a000-000000000001', '케어브릿지 데모 요양센터', false),
  ('00000000-0000-4000-a000-000000000002', '케어브릿지 데모 교육원', true)
on conflict (id) do nothing;

-- ── 합성 어르신 ───────────────────────────────────────────
-- 김○○: 시나리오 1 (시설, 와상, 복약 대상) / 이○○: 시나리오 2 (재가) / 최○○: 시나리오 3 (교육용)
insert into public.residents (id, org_id, alias, care_type, is_synthetic) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', '김○○ 어르신', 'facility', true),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001', '이○○ 어르신', 'home', true),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002', '최○○ 어르신', 'facility', true)
on conflict (id) do nothing;

-- ── 계정 (auth.users + profiles) ─────────────────────────
do $$
declare
  local_password constant text := 'carebridge-local-only';
  u record;
  uid uuid;
begin
  for u in
    select * from (values
      ('worker@carebridge.test',   '마이',          'worker',   'vi', '00000000-0000-4000-a000-000000000001'::uuid),
      ('reviewer@carebridge.test', '박 사회복지사', 'reviewer', 'ko', '00000000-0000-4000-a000-000000000001'::uuid),
      ('trainee@carebridge.test',  '응옥',          'worker',   'vi', '00000000-0000-4000-a000-000000000002'::uuid),
      ('trainer@carebridge.test',  '강사',          'reviewer', 'ko', '00000000-0000-4000-a000-000000000002'::uuid)
    ) as t(email, name, role, native_lang, org_id)
  loop
    select id into uid from auth.users where email = u.email;

    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', u.email,
        extensions.crypt(local_password, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(),
        '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid, uid::text, 'email',
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        now(), now(), now()
      );
    end if;

    insert into public.profiles (id, org_id, role, name, native_lang, onboarded)
    values (uid, u.org_id, u.role, u.name, u.native_lang, true)
    on conflict (id) do nothing;
  end loop;
end $$;

-- ── 담당 연결 ─────────────────────────────────────────────
-- 못 쓴 기록(데이터 구조 v1.5): 시작일은 시드를 돌린 날(한국)의 7일 전이라 지난 7일이 모두 계산에 들어감.
-- 방문 요일은 재가(이○○)만 평일(월~금), 시설은 비움(매일). 이미 있는 담당 연결도 이 두 칸을 다시 맞춤.
insert into public.assignments (worker_id, resident_id, schedule, visit_days, start_date)
select p.id, r.id, t.schedule, t.visit_days, (now() at time zone 'Asia/Seoul')::date - 7
from (values
  ('worker@carebridge.test',  '00000000-0000-4000-b000-000000000001'::uuid, '매일 07:00~16:00', null::smallint[]),
  ('worker@carebridge.test',  '00000000-0000-4000-b000-000000000002'::uuid, '평일 14:00~17:00', '{1,2,3,4,5}'::smallint[]),
  ('trainee@carebridge.test', '00000000-0000-4000-b000-000000000003'::uuid, '실습 09:00~12:00', null::smallint[])
) as t(email, resident_id, schedule, visit_days)
join auth.users u on u.email = t.email
join public.profiles p on p.id = u.id
join public.residents r on r.id = t.resident_id
on conflict (worker_id, resident_id) do update
  set start_date = excluded.start_date, visit_days = excluded.visit_days;
