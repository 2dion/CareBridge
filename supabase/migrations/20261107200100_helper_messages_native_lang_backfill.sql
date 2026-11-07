-- 도우미 답 언어 옛 행 채우기 고침(이슈 #394 3번, 결정 2026-11-07-도우미답언어백필).
-- 20261106130000에서 answer_native가 빈 옛 행을 모두 ko로 두었는데, Mock이거나 번역이 실패해 빈칸이던 베트남어 작성자의 답도
-- 한국어 답으로 분류돼 같은 질문 재사용(find_helper_answer)에서 빠졌다.
-- 1) 빈 번역 + ko로 채워진 행 중 작성자 프로필 언어가 ko가 아닌 행은 프로필 언어로 바꾼다(그 밖의 행은 그대로).
--    native_lang은 만든 뒤 바꾸지 못하는 칸이라 트리거를 잠시 끈다. 이 마이그레이션 밖에서는 여전히 바꿀 수 없다.
-- 2) find_helper_answer: 번역이 빈 답은 한국어 작성자에게만 재사용한다(모국어 작성자에게 번역 없는 답을 돌려주지 않게).
-- 코디세이 DB(fffgpgrnppxxqccncstf)에만 적용한다. 공모전 DB(CareBridge)에는 적용하지 않는다.

alter table public.helper_messages disable trigger helper_messages_keep_native_lang;

update public.helper_messages m
set native_lang = p.native_lang
from public.profiles p
where p.id = m.worker_id
  and m.answer_native = ''
  and m.native_lang = 'ko'
  and p.native_lang <> 'ko';

alter table public.helper_messages enable trigger helper_messages_keep_native_lang;

create or replace function public.find_helper_answer(p_worker_id uuid, p_question_ko text)
returns table (answer_ko text, answer_native text, source text, found boolean)
language sql stable set search_path = ''
as $$
  select m.answer_ko, m.answer_native, m.source, m.found
  from public.helper_messages m
  join public.profiles asker on asker.id = p_worker_id
  where m.org_id = asker.org_id
    and m.native_lang = asker.native_lang
    and (m.native_lang = 'ko' or m.answer_native <> '')
    and m.found
    and private.helper_question_key(p_question_ko) <> ''
    and private.helper_question_key(coalesce(nullif(m.question_ko, ''), m.question))
        = private.helper_question_key(p_question_ko)
  order by m.created_at desc
  limit 1
$$;

comment on function public.find_helper_answer(uuid, text) is
  '도우미 같은 질문 재사용(#229, #354, #394): 같은 기관·같은 답 언어(helper_messages.native_lang)·교재에서 찾은 답 중 가장 최근. 번역이 빈 답은 한국어 작성자에게만. 서버 전용';
