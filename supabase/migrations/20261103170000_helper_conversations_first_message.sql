-- 도우미 대화의 마지막 질문 시각: 첫 질문은 대화를 만든 시각(기본값 now())보다 앞일 수 있다(묶어 넣기·늦게 저장).
-- 질문이 없는 대화(message_count = 0)에 첫 질문이 들어오면 그 질문 시각으로 맞추고, 그 뒤는 더 늦은 시각만 남긴다.
-- 근거: 문서/설계/데이터구조-v2.3.4.md 'helper_conversations' last_message_at = 마지막 질문 시각 (이슈 #251)

create or replace function private.helper_messages_bump_conversation() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.helper_conversations
    set last_message_at = case
          when message_count = 0 then new.created_at
          else greatest(last_message_at, new.created_at)
        end,
        message_count = message_count + 1
    where id = new.conversation_id;
  return new;
end $$;
