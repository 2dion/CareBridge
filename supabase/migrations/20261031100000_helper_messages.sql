-- W6(도우미) 대화 저장: 질문 1개 + 답 1개 = 1행. 표 13개 → 14개
-- 근거: 문서/결정/2026-10-31-도우미대화저장.md, 문서/설계/데이터구조-v1.7.md 'helper_messages' (이슈 #218)
--
-- 넣기는 서버(service_role)만 한다. 화면 키(authenticated)는 읽기만 되고 넣기·고치기·지우기는 permission denied다.
-- 읽기: 작성자는 내 행만, 같은 기관 관리자·강사는 기관 전체. 다른 기관은 아무도 못 읽는다.
-- org_id는 보내지 않아도 DB가 worker_id의 프로필에서 채운다. 계정을 지우면 행도 함께 지운다.

create table public.helper_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 500),
  question_ko text not null default '',
  answer_ko text not null,
  answer_native text not null default '',
  source text not null default '',
  found boolean not null,
  safety boolean not null default false,
  created_at timestamptz not null default now()
);
create index helper_messages_worker_idx on public.helper_messages (worker_id, created_at desc);
create index helper_messages_org_idx on public.helper_messages (org_id, created_at desc);

-- org_id는 보내는 값을 믿지 않고 작성자의 프로필 기관으로 덮어쓴다 (기관이 섞이지 않게)
create function private.helper_messages_set_org() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select org_id into new.org_id from public.profiles where id = new.worker_id;
  if new.org_id is null then
    raise exception 'not_record_worker';
  end if;
  return new;
end $$;

create trigger helper_messages_set_org before insert on public.helper_messages
  for each row execute function private.helper_messages_set_org();

alter table public.helper_messages enable row level security;

revoke all on public.helper_messages from anon, authenticated;
grant select on public.helper_messages to authenticated;
grant select, insert on public.helper_messages to service_role;

create policy helper_messages_read on public.helper_messages for select to authenticated
  using (org_id = private.my_org_id() and (worker_id = auth.uid() or private.is_reviewer()));
