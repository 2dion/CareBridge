-- 적용된 DB에서 실행. 도우미 같은 질문 재사용 find_helper_answer 검사(이슈 #229). 마지막 ROLLBACK으로 합성 픽스처를 지운다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;

-- 비교 글: 소문자, 빈칸·문장부호 제거
select pg_temp.check_true(private.helper_question_key(' 밥을  안 드셔요? ') = '밥을안드셔요', 'key strips space/punct');
select pg_temp.check_true(private.helper_question_key('Cụ không ăn, phải làm sao?') = 'cụkhôngănphảilàmsao', 'key lowercases');
select pg_temp.check_true(private.helper_question_key('') = '', 'key empty');

-- 권한: 서버만
select pg_temp.check_true(has_function_privilege('service_role', 'public.find_helper_answer(uuid,text)', 'execute'), 'service_role fn');
select pg_temp.check_true(not has_function_privilege('authenticated', 'public.find_helper_answer(uuid,text)', 'execute'), 'authenticated fn');
select pg_temp.check_true(not has_function_privilege('anon', 'public.find_helper_answer(uuid,text)', 'execute'), 'anon fn');

insert into public.organizations(id,name) values
 ('d1000000-0000-0000-0000-000000000001','검증 기관 가'),
 ('d1000000-0000-0000-0000-000000000002','검증 기관 나');
insert into auth.users(id) values
 ('d2000000-0000-0000-0000-000000000001'),('d2000000-0000-0000-0000-000000000002'),
 ('d2000000-0000-0000-0000-000000000003'),('d2000000-0000-0000-0000-000000000004');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','worker','가상 작성자 갑','vi'),
 ('d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','worker','가상 작성자 을','vi'),
 ('d2000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000001','worker','가상 작성자 한국어','ko'),
 ('d2000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000002','worker','가상 작성자 병','vi');

set local role service_role;
insert into public.helper_conversations(id,worker_id,title) values
 ('d3000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','갑'),
 ('d3000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000003','한국어'),
 ('d3000000-0000-0000-0000-000000000004','d2000000-0000-0000-0000-000000000004','병');
insert into public.helper_messages(worker_id,conversation_id,question,question_ko,answer_ko,answer_native,source,found,created_at) values
 -- 갑: 베트남어 질문을 한국어로 옮겨 찾은 답(옛 답)과 더 최근의 답
 ('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','Cụ không ăn cơm','어르신이 밥을 안 드셔요','옛 답','Trả lời cũ','10장',true, now() - interval '2 days'),
 ('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','어르신이 밥을 안 드셔요.','','억지로 권하지 마세요.','Đừng ép ăn.','10장 120쪽',true, now() - interval '1 day'),
 -- 갑: 못 찾은 답은 재사용하지 않는다
 ('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','주식 시세','','교재에서 찾지 못했어요.','','',false, now()),
 -- 한국어 작성자의 같은 질문(다른 모국어)
 ('d2000000-0000-0000-0000-000000000003','d3000000-0000-0000-0000-000000000003','낙상 예방','','한국어 작성자 답','','12장',true, now()),
 -- 다른 기관의 같은 질문
 ('d2000000-0000-0000-0000-000000000004','d3000000-0000-0000-0000-000000000004','어르신이 밥을 안 드셔요','','다른 기관 답','Khác','9장',true, now());

-- 같은 기관 다른 작성자(을)가 빈칸·문장부호만 다른 같은 질문을 물으면 가장 최근 답
select pg_temp.check_true((select answer_ko = '억지로 권하지 마세요.' and answer_native = 'Đừng ép ăn.' and source = '10장 120쪽' and found
  from public.find_helper_answer('d2000000-0000-0000-0000-000000000002', ' 어르신이  밥을 안 드셔요 ')), 'reuse latest found answer in org');
-- question_ko로도 맞는다
select pg_temp.check_true((select count(*) = 1 from public.find_helper_answer('d2000000-0000-0000-0000-000000000002', '어르신이 밥을 안 드셔요')), 'one row');
-- 못 찾은 답은 재사용 안 함
select pg_temp.check_true((select count(*) = 0 from public.find_helper_answer('d2000000-0000-0000-0000-000000000002', '주식 시세')), 'not-found answers skipped');
-- 다른 모국어 작성자의 답은 쓰지 않음
select pg_temp.check_true((select count(*) = 0 from public.find_helper_answer('d2000000-0000-0000-0000-000000000002', '낙상 예방')), 'other language skipped');
select pg_temp.check_true((select count(*) = 1 from public.find_helper_answer('d2000000-0000-0000-0000-000000000003', '낙상 예방')), 'same language ko reused');
-- 다른 기관 작성자는 이 기관 답을 받지 못함(자기 기관 답만)
select pg_temp.check_true((select answer_ko = '다른 기관 답' from public.find_helper_answer('d2000000-0000-0000-0000-000000000004', '어르신이 밥을 안 드셔요')), 'other org sees only own org');
-- 빈 질문·없는 작성자는 빈 결과
select pg_temp.check_true((select count(*) = 0 from public.find_helper_answer('d2000000-0000-0000-0000-000000000002', ' ?? ')), 'empty key');
select pg_temp.check_true((select count(*) = 0 from public.find_helper_answer('d2000000-0000-0000-0000-0000000000ff', '어르신이 밥을 안 드셔요')), 'unknown worker');
-- 언어를 바꾼 작성자의 옛 답(이슈 #354): 답의 언어(helper_messages.native_lang)로 비교하고, 작성자의 지금 언어는 보지 않는다
reset role;
update public.profiles set native_lang='zh' where id='d2000000-0000-0000-0000-000000000001';
set local role service_role;
-- 갑이 zh로 바꿨어도 옛 vi 답은 vi 작성자(을)에게 계속 재사용된다
select pg_temp.check_true((select count(*) = 1 from public.find_helper_answer('d2000000-0000-0000-0000-000000000002', '어르신이 밥을 안 드셔요')), 'old vi answer reused for vi asker after author switched');
-- zh로 바꾼 갑 자신은 vi 답을 받지 않는다
select pg_temp.check_true((select count(*) = 0 from public.find_helper_answer('d2000000-0000-0000-0000-000000000001', '어르신이 밥을 안 드셔요')), 'switched author does not get vi answer');
-- 지금 zh인 갑의 새 답(zh)은 zh 작성자에게만
insert into public.helper_messages(worker_id,conversation_id,question,answer_ko,answer_native,source,found,native_lang) values
 ('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','약 시간','약은 정해진 시간에 드리세요.','请按时给药。','8장',true,'zh');
select pg_temp.check_true((select count(*) = 0 from public.find_helper_answer('d2000000-0000-0000-0000-000000000002', '약 시간')), 'zh answer not given to vi asker');
select pg_temp.check_true((select answer_native = '请按时给药。' from public.find_helper_answer('d2000000-0000-0000-0000-000000000001', '약 시간')), 'zh answer given to zh asker');
reset role;

select 'find-helper-answer: all assertions passed' as result;
rollback;
