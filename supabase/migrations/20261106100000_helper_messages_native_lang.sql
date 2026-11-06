-- 도우미(W6) 답의 언어(이슈 #354): helper_messages에 답을 만든 때 작성자 언어 native_lang를 남긴다.
-- 근거: 문서/결정/2026-11-06-도우미답언어.md, 문서/결정/2026-11-05-기록언어기준.md, 2026-11-05-언어선택화면.md 5번
-- 1) 칸 추가(이름·값은 records.native_lang과 같다). 서버가 답을 넣을 때 그 순간의 작성자 언어를 보낸다.
--    보내지 않으면 DB가 작성자의 지금 프로필 언어로 채운다(옛 서버 코드가 새 칸 없이 넣어도 틀린 언어가 되지 않게).
-- 2) 옛 행: answer_native가 빈 행은 ko, 나머지는 vi. 지금까지 켜진 언어가 ko·vi뿐이라 실제 사용자 행은 이게 맞다.
--    (QA가 11/06에 zh·mn·en으로 시험한 합성 행은 알 수 없어 vi로 남는다.)
-- 3) find_helper_answer(같은 질문 재사용, #229): 답을 쓴 사람의 '지금' 프로필 언어 대신 그 행의 native_lang으로 비교한다.
-- 코디세이 DB(fffgpgrnppxxqccncstf)에만 적용한다. 공모전 DB(CareBridge)에는 적용하지 않는다.

alter table public.helper_messages add column native_lang text;

update public.helper_messages
set native_lang = case when answer_native = '' then 'ko' else 'vi' end
where native_lang is null;

alter table public.helper_messages alter column native_lang set not null;
alter table public.helper_messages add constraint helper_messages_native_lang_check
  check (native_lang in ('ko', 'vi', 'zh', 'mn', 'en'));
comment on column public.helper_messages.native_lang is
  '답을 만든 때 작성자 언어. 서버도 고치지 못한다(helper_messages는 넣기만 됨, records.native_lang과 같은 기준). 화면은 지금 언어와 다르면 번역 줄을 숨긴다';

-- org_id와 같은 방식으로 작성자 프로필에서 채운다: org_id는 항상 덮어쓰고, native_lang은 보내지 않았을 때만 채운다
create or replace function private.helper_messages_set_org() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  worker_lang text;
begin
  select org_id, native_lang into new.org_id, worker_lang from public.profiles where id = new.worker_id;
  if new.org_id is null then
    raise exception 'not_record_worker';
  end if;
  new.native_lang := coalesce(new.native_lang, worker_lang);
  return new;
end $$;

create or replace function public.find_helper_answer(p_worker_id uuid, p_question_ko text)
returns table (answer_ko text, answer_native text, source text, found boolean)
language sql stable set search_path = ''
as $$
  select m.answer_ko, m.answer_native, m.source, m.found
  from public.helper_messages m
  join public.profiles asker on asker.id = p_worker_id
  where m.org_id = asker.org_id
    and m.native_lang = asker.native_lang
    and m.found
    and private.helper_question_key(p_question_ko) <> ''
    and private.helper_question_key(coalesce(nullif(m.question_ko, ''), m.question))
        = private.helper_question_key(p_question_ko)
  order by m.created_at desc
  limit 1
$$;

comment on function public.find_helper_answer(uuid, text) is
  '도우미 같은 질문 재사용(#229, #354): 같은 기관·같은 답 언어(helper_messages.native_lang)·교재에서 찾은 답 중 가장 최근. 서버 전용';
