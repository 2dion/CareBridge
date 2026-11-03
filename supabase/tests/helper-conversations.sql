-- 적용된 DB에서 실행. W6(도우미) 대화 묶음 helper_conversations 검사(이슈 #251). 마지막 ROLLBACK으로 합성 픽스처를 지운다.
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

-- 제목 규칙: 앞 30자, 넘으면 '…', 줄바꿈·연속 빈칸은 하나로
select pg_temp.check_true(private.helper_title('  밥을   안
드셔요 ') = '밥을 안 드셔요', 'title collapses whitespace');
select pg_temp.check_true(private.helper_title(repeat('가', 31)) = repeat('가', 30) || '…', 'title 30 chars + ellipsis');
select pg_temp.check_true(private.helper_title(repeat('가', 30)) = repeat('가', 30), 'title exactly 30 chars');

insert into public.organizations(id,name) values
 ('c1000000-0000-0000-0000-000000000001','검증 기관 가'),
 ('c1000000-0000-0000-0000-000000000002','검증 기관 나');
insert into auth.users(id) values
 ('c2000000-0000-0000-0000-000000000001'),('c2000000-0000-0000-0000-000000000002'),
 ('c2000000-0000-0000-0000-000000000003'),('c2000000-0000-0000-0000-000000000004');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','worker','가상 작성자 갑','vi'),
 ('c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','reviewer','가상 관리자 갑','ko'),
 ('c2000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','worker','가상 작성자 을','vi'),
 ('c2000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000002','worker','가상 작성자 병','vi');

-- 대화 만들기는 서버(service_role)만. org_id는 보내지 않아도 작성자 기관으로 채워진다
set local role service_role;
insert into public.helper_conversations(id,worker_id,title) values
 ('c3000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','갑의 대화 1'),
 ('c3000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001','갑의 대화 2'),
 ('c3000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000003','을의 대화'),
 ('c3000000-0000-0000-0000-000000000004','c2000000-0000-0000-0000-000000000004','병의 대화');
insert into public.helper_conversations(org_id,worker_id,title) values
 ('c1000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001','기관 위조 대화');
reset role;
select pg_temp.check_true((select org_id='c1000000-0000-0000-0000-000000000001' from public.helper_conversations where title='기관 위조 대화'),'보낸 org_id를 작성자 기관으로 덮어씀');
select pg_temp.check_true((select message_count=0 from public.helper_conversations where id='c3000000-0000-0000-0000-000000000001'),'new conversation count 0');

-- 질문을 넣으면 그 대화의 마지막 시각·질문 수가 바뀐다
set local role service_role;
insert into public.helper_messages(worker_id,conversation_id,question,answer_ko,found,created_at) values
 ('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','첫 질문','답',true, now() - interval '2 minutes'),
 ('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','둘째 질문','답',true, now() - interval '1 minute'),
 ('c2000000-0000-0000-0000-000000000003','c3000000-0000-0000-0000-000000000003','을 질문','답',true, now());
reset role;
select pg_temp.check_true((select message_count=2 from public.helper_conversations where id='c3000000-0000-0000-0000-000000000001'),'count bumped to 2');
select pg_temp.check_true((select last_message_at=(select max(created_at) from public.helper_messages where conversation_id='c3000000-0000-0000-0000-000000000001') from public.helper_conversations where id='c3000000-0000-0000-0000-000000000001'),'last_message_at = latest question');
select pg_temp.check_true((select message_count=0 from public.helper_conversations where id='c3000000-0000-0000-0000-000000000002'),'other conversation untouched');

-- 남의 대화(같은 기관 을의 대화, 다른 기관 병의 대화)에는 넣지 못한다. 대화 없이도 넣지 못한다
set local role service_role;
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,conversation_id,question,answer_ko,found)
  values ('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000003','남의 대화','답',true)$q$,'conversation_not_found');
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,conversation_id,question,answer_ko,found)
  values ('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000004','다른 기관 대화','답',true)$q$,'conversation_not_found');
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,conversation_id,question,answer_ko,found)
  values ('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-0000000000ff','없는 대화','답',true)$q$,'conversation_not_found');
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,question,answer_ko,found)
  values ('c2000000-0000-0000-0000-000000000001','대화 없음','답',true)$q$,'conversation_not_found');
-- 서버도 마지막 시각·질문 수를 직접 고치지 못한다
select pg_temp.expect_error($q$update public.helper_conversations set message_count=99$q$,'permission denied');
reset role;

-- 작성자 갑: 내 대화만(3개), 내 질문만
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=3 from public.helper_conversations),'작성자는 내 대화만(3개)');
select pg_temp.check_true((select count(*)=0 from public.helper_conversations where worker_id<>'c2000000-0000-0000-0000-000000000001'),'다른 작성자 대화는 안 보임');
select pg_temp.check_true((select count(*)=2 from public.helper_messages where conversation_id='c3000000-0000-0000-0000-000000000001'),'대화로 질문을 읽음');
-- 화면 키로는 대화를 만들거나 고치거나 지우지 못한다
select pg_temp.expect_error($q$insert into public.helper_conversations(worker_id,title) values ('c2000000-0000-0000-0000-000000000001','꾸민 대화')$q$,'permission denied');
select pg_temp.expect_error($q$update public.helper_conversations set title='바꾼 제목'$q$,'permission denied');
select pg_temp.expect_error($q$delete from public.helper_conversations$q$,'permission denied');

-- 관리자 갑: 같은 기관 전체(4개), 다른 기관은 안 보임
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=4 from public.helper_conversations),'관리자는 같은 기관 대화 전체(4개)');
select pg_temp.check_true((select count(*)=0 from public.helper_conversations where org_id<>'c1000000-0000-0000-0000-000000000001'),'다른 기관 대화는 안 보임');

-- 다른 기관 작성자 병: 자기 대화 1개
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.check_true((select count(*)=1 from public.helper_conversations),'다른 기관 작성자는 자기 대화만(1개)');

-- 로그인 안 한 키(anon)는 읽지 못함
reset role;
set local role anon;
select pg_temp.expect_error($q$select * from public.helper_conversations$q$,'permission denied');

-- 계정을 지우면 대화와 질문도 함께 지워짐
reset role;
delete from auth.users where id='c2000000-0000-0000-0000-000000000003';
select pg_temp.check_true((select count(*)=0 from public.helper_conversations where worker_id='c2000000-0000-0000-0000-000000000003'),'계정 삭제 시 대화도 삭제');
select pg_temp.check_true((select count(*)=0 from public.helper_messages where worker_id='c2000000-0000-0000-0000-000000000003'),'계정 삭제 시 질문도 삭제');

select 'helper-conversations: all assertions passed' as result;
rollback;
