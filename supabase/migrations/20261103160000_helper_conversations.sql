-- W6(도우미) 대화 묶음(이슈 #251): 대화 1개 = 1행 helper_conversations, helper_messages.conversation_id(필수). 표 17개 → 18개
-- 근거: 문서/결정/2026-11-03-도우미대화묶음.md, 문서/설계/데이터구조-v2.3.4.md 'helper_conversations'·'helper_messages'·'공통 계약'
--
-- 넣기는 서버(service_role)만. 화면 키(authenticated)는 읽기만: 작성자는 내 대화, 같은 기관 관리자·강사는 기관 전체.
-- last_message_at·message_count는 helper_messages 넣기 트리거가 바꾼다(서버 코드는 직접 고치지 않는다).
-- helper_messages를 넣을 때 대화의 worker_id가 같은지 DB가 검사한다(다르면 conversation_not_found).
-- 있던 helper_messages는 작성자·한국 날짜별로 대화 하나씩 묶는다(제목 = 그날 첫 질문 앞 30자).

-- ─────────────────────────────────────────────────────────
-- 1. 대화 표
-- ─────────────────────────────────────────────────────────

create table public.helper_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '',
  last_message_at timestamptz not null default now(),
  message_count int not null default 0,
  created_at timestamptz not null default now()
);
create index helper_conversations_worker_idx on public.helper_conversations (worker_id, last_message_at desc);
create index helper_conversations_org_idx on public.helper_conversations (org_id, last_message_at desc);
comment on table public.helper_conversations is 'W6 도우미 대화 묶음. [새 대화]부터 다음 [새 대화]까지. 빈 대화는 만들지 않는다';

-- 제목 규칙: 줄바꿈·연속 빈칸은 빈칸 하나로, 앞 30자, 넘으면 끝에 '…'. 서버 코드(web/lib/helper/ask.ts conversationTitle)와 같다
create function private.helper_title(question text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when char_length(regexp_replace(btrim(question), '\s+', ' ', 'g')) > 30
      then left(regexp_replace(btrim(question), '\s+', ' ', 'g'), 30) || '…'
    else regexp_replace(btrim(question), '\s+', ' ', 'g')
  end
$$;

-- org_id는 보내는 값을 믿지 않고 작성자의 프로필 기관으로 덮어쓴다 (helper_messages와 같이)
create function private.helper_conversations_set_org() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select org_id into new.org_id from public.profiles where id = new.worker_id;
  if new.org_id is null then
    raise exception 'not_record_worker';
  end if;
  return new;
end $$;

create trigger helper_conversations_set_org before insert on public.helper_conversations
  for each row execute function private.helper_conversations_set_org();

alter table public.helper_conversations enable row level security;
revoke all on public.helper_conversations from anon, authenticated;
grant select on public.helper_conversations to authenticated;
grant select, insert on public.helper_conversations to service_role; -- Supabase 기본 권한으로 이미 모두 있음. 뜻을 적어 둠

create policy helper_conversations_read on public.helper_conversations for select to authenticated
  using (org_id = private.my_org_id() and (worker_id = auth.uid() or private.is_reviewer()));

-- ─────────────────────────────────────────────────────────
-- 2. helper_messages.conversation_id + 있던 행 묶기
-- ─────────────────────────────────────────────────────────

alter table public.helper_messages
  add column conversation_id uuid references public.helper_conversations (id) on delete cascade;
create index helper_messages_conversation_idx on public.helper_messages (conversation_id, created_at);

-- 작성자·한국 날짜별 대화 하나. 제목은 그날 첫 질문, 시각·수는 묶은 행으로 계산
with grouped as (
  select worker_id, (created_at at time zone 'Asia/Seoul')::date as day,
         min(created_at) as first_at, max(created_at) as last_at, count(*)::int as n
  from public.helper_messages
  where conversation_id is null
  group by worker_id, (created_at at time zone 'Asia/Seoul')::date
), created as (
  insert into public.helper_conversations (worker_id, title, last_message_at, message_count, created_at)
  select g.worker_id, private.helper_title(first_q.question), g.last_at, g.n, g.first_at
  from grouped g
  join lateral (
    select question from public.helper_messages m
    where m.worker_id = g.worker_id and m.created_at = g.first_at
    order by m.id limit 1
  ) first_q on true
  returning id, worker_id, created_at
)
update public.helper_messages m
  set conversation_id = c.id
  from created c
  where m.conversation_id is null
    and m.worker_id = c.worker_id
    and (m.created_at at time zone 'Asia/Seoul')::date = (c.created_at at time zone 'Asia/Seoul')::date;

alter table public.helper_messages alter column conversation_id set not null;

-- ─────────────────────────────────────────────────────────
-- 3. 같은 사람 검사 + 마지막 시각·질문 수
-- ─────────────────────────────────────────────────────────

create function private.helper_messages_check_conversation() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
begin
  select worker_id into owner from public.helper_conversations where id = new.conversation_id;
  if owner is null or owner <> new.worker_id then
    raise exception 'conversation_not_found';
  end if;
  return new;
end $$;

create trigger helper_messages_check_conversation before insert on public.helper_messages
  for each row execute function private.helper_messages_check_conversation();

create function private.helper_messages_bump_conversation() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.helper_conversations
    set last_message_at = greatest(last_message_at, new.created_at),
        message_count = message_count + 1
    where id = new.conversation_id;
  return new;
end $$;

create trigger helper_messages_bump_conversation after insert on public.helper_messages
  for each row execute function private.helper_messages_bump_conversation();
