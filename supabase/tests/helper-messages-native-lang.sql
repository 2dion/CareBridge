-- 적용된 DB에서 실행. 도우미 답의 언어 helper_messages.native_lang 검사(이슈 #354). 마지막 ROLLBACK으로 합성 픽스처를 지운다.
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

insert into public.organizations(id,name) values ('e1000000-0000-0000-0000-000000000001','검증 기관 가');
insert into auth.users(id) values ('e2000000-0000-0000-0000-000000000001'),('e2000000-0000-0000-0000-000000000002');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','worker','가상 작성자 갑','zh'),
 ('e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','worker','가상 작성자 을','vi');

set local role service_role;
insert into public.helper_conversations(id,worker_id,title) values
 ('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','갑'),
 ('e3000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','을');
-- 보내지 않으면 작성자의 지금 프로필 언어로 채운다
insert into public.helper_messages(worker_id,conversation_id,question,answer_ko,answer_native,found)
 values ('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','안 보낸 질문','답','答',true);
select pg_temp.check_true((select native_lang='zh' from public.helper_messages where question='안 보낸 질문'),'보내지 않으면 프로필 언어(zh)');
-- 보내면 그 값을 쓴다
insert into public.helper_messages(worker_id,conversation_id,question,answer_ko,answer_native,found,native_lang)
 values ('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','보낸 질문','답','Trả lời',true,'vi');
select pg_temp.check_true((select native_lang='vi' from public.helper_messages where question='보낸 질문'),'보낸 값이 우선');
-- 허용 값 밖은 거절
select pg_temp.expect_error($q$insert into public.helper_messages(worker_id,conversation_id,question,answer_ko,found,native_lang)
  values ('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','잘못된 언어','답',true,'xx')$q$,'helper_messages_native_lang_check');
-- 서버(service_role)도 만든 뒤에는 고치지 못한다
select pg_temp.expect_error($q$update public.helper_messages set native_lang='ko' where question='보낸 질문'$q$,'invalid_transition');
reset role;

-- 프로필 언어를 바꿔도 옛 행의 언어는 그대로
update public.profiles set native_lang='en' where id='e2000000-0000-0000-0000-000000000001';
select pg_temp.check_true((select native_lang='zh' from public.helper_messages where question='안 보낸 질문'),'언어를 바꿔도 옛 행은 zh 그대로');

select 'helper-messages-native-lang: all assertions passed' as result;
rollback;
