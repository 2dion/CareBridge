-- 적용된 DB에서 실행. W6(도우미) 대화 저장 helper_messages 검사(이슈 #218). 마지막 ROLLBACK으로 합성 픽스처를 지운다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void
language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise; end if;
    caught := true;
  end;
  if not caught then raise exception 'expected error: %', expected; end if;
end $$;

insert into public.organizations(id,name) values
 ('f1000000-0000-0000-0000-000000000001','검증 기관 가'),
 ('f1000000-0000-0000-0000-000000000002','검증 기관 나');
insert into auth.users(id) values
 ('f2000000-0000-0000-0000-000000000001'),('f2000000-0000-0000-0000-000000000002'),
 ('f2000000-0000-0000-0000-000000000003'),('f2000000-0000-0000-0000-000000000004'),
 ('f2000000-0000-0000-0000-000000000005');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','worker','가상 작성자 갑','vi'),
 ('f2000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','reviewer','가상 관리자 갑','ko'),
 ('f2000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000001','worker','가상 작성자 을','vi'),
 ('f2000000-0000-0000-0000-000000000004','f1000000-0000-0000-0000-000000000002','worker','가상 작성자 병','vi'),
 ('f2000000-0000-0000-0000-000000000005','f1000000-0000-0000-0000-000000000002','reviewer','가상 관리자 을','ko');

-- 넣기는 서버(service_role)만. org_id는 보내지 않아도 작성자의 기관으로 채워진다
set local role service_role;
insert into public.helper_messages(worker_id,question,question_ko,answer_ko,answer_native,source,found,safety) values
 ('f2000000-0000-0000-0000-000000000001','Cụ không ăn cơm','어르신이 밥을 안 드셔요','억지로 권하지 마세요.','Đừng ép ăn.','10장 120쪽',true,false),
 ('f2000000-0000-0000-0000-000000000001','합성 질문 둘','','교재에서 찾지 못했어요.','','',false,false),
 ('f2000000-0000-0000-0000-000000000003','합성 질문 을','','답 을','','',true,false),
 ('f2000000-0000-0000-0000-000000000004','합성 질문 병','','답 병','','',true,false);
select pg_temp.check_true((select count(*)=3 from public.helper_messages where org_id='f1000000-0000-0000-0000-000000000001'),'org_id를 작성자 프로필에서 채움(가 기관 3행)');
select pg_temp.check_true((select count(*)=1 from public.helper_messages where org_id='f1000000-0000-0000-0000-000000000002'),'org_id를 작성자 프로필에서 채움(나 기관 1행)');
-- 보내온 org_id는 믿지 않는다
insert into public.helper_messages(org_id,worker_id,question,answer_ko,found)
 values ('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','기관 위조 질문','답',true);
select pg_temp.check_true((select org_id='f1000000-0000-0000-0000-000000000001' from public.helper_messages where question='기관 위조 질문'),'보낸 org_id를 작성자 기관으로 덮어씀');
-- 질문 길이: 비었거나 500자를 넘으면 거절
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,question,answer_ko,found) values ('f2000000-0000-0000-0000-000000000001','','답',true)$q$,'helper_messages_question_check');
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,question,answer_ko,found) values ('f2000000-0000-0000-0000-000000000001',repeat('가',501),'답',true)$q$,'helper_messages_question_check');
-- 없는 작성자
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,question,answer_ko,found) values ('f2000000-0000-0000-0000-0000000000ff','질문','답',true)$q$,'not_record_worker');

-- 작성자 갑: 내 행만 읽음(같은 기관 작성자 을·다른 기관 병은 안 보임)
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=3 from public.helper_messages),'작성자는 내 행만 읽음(3행)');
select pg_temp.check_true((select count(*)=0 from public.helper_messages where worker_id<>'f2000000-0000-0000-0000-000000000001'),'다른 작성자·다른 기관 행은 안 보임');
-- 화면 키로는 넣기·고치기·지우기 모두 안 됨
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,question,answer_ko,found) values ('f2000000-0000-0000-0000-000000000001','꾸며 넣기','꾸민 답',true)$q$,'permission denied');
select pg_temp.expect_error($q$update public.helper_messages set answer_ko='바꾼 답'$q$,'permission denied');
select pg_temp.expect_error($q$delete from public.helper_messages$q$,'permission denied');

-- 작성자 을: 내 행 1개만
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=1 from public.helper_messages),'다른 작성자는 자기 행만(1행)');

-- 관리자 갑: 같은 기관 전체(4행), 다른 기관은 안 보임
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=4 from public.helper_messages),'관리자·강사는 같은 기관 전체(4행)');
select pg_temp.check_true((select count(*)=0 from public.helper_messages where org_id<>'f1000000-0000-0000-0000-000000000001'),'다른 기관 행은 안 보임');
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,question,answer_ko,found) values ('f2000000-0000-0000-0000-000000000001','관리자가 넣기','답',true)$q$,'permission denied');
select pg_temp.expect_error($q$update public.helper_messages set answer_ko='바꾼 답'$q$,'permission denied');
select pg_temp.expect_error($q$delete from public.helper_messages$q$,'permission denied');

-- 다른 기관 관리자 을: 나 기관 1행만
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=1 and bool_and(org_id='f1000000-0000-0000-0000-000000000002') from public.helper_messages),'다른 기관 관리자는 자기 기관 행만(1행)');

-- 로그인 안 한 키(anon)는 읽지 못함
reset role;
set local role anon;
select pg_temp.expect_error($q$select * from public.helper_messages$q$,'permission denied');

-- 계정을 지우면 그 사람의 행도 함께 지워짐
reset role;
delete from auth.users where id='f2000000-0000-0000-0000-000000000004';
select pg_temp.check_true((select count(*)=0 from public.helper_messages where worker_id='f2000000-0000-0000-0000-000000000004'),'계정 삭제 시 행도 삭제');
rollback;
