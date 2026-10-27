-- 가입 코드: 기관이 나눠 준 코드가 가입한 사람의 기관과 역할을 정함
-- 근거: 문서/결정/2026-10-25-로그인가입.md, 문서/설계/데이터구조-v1.6.md ('join_codes', '권한 규칙' 가입)
--
-- 코드 값은 팀장이 SQL Editor에서 넣고 저장소(seed.sql)에 두지 않음(저장소 공개).
-- 가입 코드 확인과 계정 만들기는 서버 API(/api/auth/signup)가 service_role로 함.
-- 그래서 로그인 전 사람을 위한 정책은 두지 않고, 담당자·강사는 같은 기관 코드를 읽기만 함(R4).

create table public.join_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  role text not null check (role in ('worker', 'reviewer')),
  -- 대문자·숫자 8자 이상, 헷갈리는 글자(0·O, 1·I) 빼기, 모든 기관에서 겹치지 않음
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8,}$'),
  active boolean not null default true, -- false면 이 코드로 가입 못 함
  created_at timestamptz not null default now()
);
create index join_codes_org_id_idx on public.join_codes (org_id);

revoke all on public.join_codes from anon, authenticated;
grant select on public.join_codes to authenticated;

alter table public.join_codes enable row level security;

create policy join_codes_reviewer_select on public.join_codes for select to authenticated
  using (org_id = private.my_org_id() and private.is_reviewer());
