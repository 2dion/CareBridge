-- 도우미(W6) 같은 질문 재사용(이슈 #229): 같은 기관·같은 모국어 작성자가 같은 질문을 물어 교재에서 찾은 답(found)이 있으면
-- 그 답을 돌려준다. 서버(service_role)만 부른다. 표·칸·권한은 그대로다.
-- 근거: 문서/결정/2026-11-03-도우미답재사용.md, 문서/설계/ai규칙-v2.0.2.md W6 9번

-- '같은 질문' 비교 글: 검색용 한국어(question_ko, 없으면 question)를 소문자로 바꾸고 빈칸·문장부호를 뺀다
create function private.helper_question_key(question text) returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(lower(coalesce(question, '')), '[[:space:][:punct:]·…‘’“”]', '', 'g')
$$;

create function public.find_helper_answer(p_worker_id uuid, p_question_ko text)
returns table (answer_ko text, answer_native text, source text, found boolean)
language sql stable set search_path = ''
as $$
  select m.answer_ko, m.answer_native, m.source, m.found
  from public.helper_messages m
  join public.profiles asker on asker.id = p_worker_id
  join public.profiles author on author.id = m.worker_id
  where m.org_id = asker.org_id
    and author.native_lang = asker.native_lang
    and m.found
    and private.helper_question_key(p_question_ko) <> ''
    and private.helper_question_key(coalesce(nullif(m.question_ko, ''), m.question))
        = private.helper_question_key(p_question_ko)
  order by m.created_at desc
  limit 1
$$;

revoke execute on function public.find_helper_answer(uuid, text) from public, anon, authenticated;
grant execute on function public.find_helper_answer(uuid, text) to service_role;
comment on function public.find_helper_answer(uuid, text) is
  '도우미 같은 질문 재사용(#229): 같은 기관·같은 모국어·교재에서 찾은 답 중 가장 최근. 서버 전용';
