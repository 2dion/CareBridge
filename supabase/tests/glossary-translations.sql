-- 이슈 #259: glossary_translations·search_glossary(lang)·records.native_lang 검사.
-- 적용된 DB에서 실행하고, 합성 픽스처는 마지막 ROLLBACK으로 지운다.
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

-- 권한: RLS 켬, 로그인 사용자는 읽기만, anon은 못 봄, 함수는 authenticated·service_role만
select pg_temp.check_true((select relrowsecurity from pg_class where oid = 'public.glossary_translations'::regclass), 'rls on');
select pg_temp.check_true(has_table_privilege('authenticated', 'public.glossary_translations', 'select'), 'authenticated select');
select pg_temp.check_true(not has_table_privilege('authenticated', 'public.glossary_translations', 'insert,update,delete'), 'authenticated write');
select pg_temp.check_true(not has_table_privilege('anon', 'public.glossary_translations', 'select'), 'anon select');
select pg_temp.check_true(has_function_privilege('authenticated', 'public.search_glossary(text,int,text)', 'execute'), 'authenticated fn');
select pg_temp.check_true(not has_function_privilege('anon', 'public.search_glossary(text,int,text)', 'execute'), 'anon fn');
select pg_temp.check_true((select count(*) = 0 from pg_proc where proname = 'search_glossary' and pronargs = 2), 'old 2-arg fn dropped');

-- 옮기기: term_vi가 있는 용어마다 vi 행이 하나씩, 같은 글
select pg_temp.check_true(
  (select count(*) from public.glossary where term_vi <> '')
  = (select count(*) from public.glossary_translations t join public.glossary g on g.id = t.glossary_id
     where t.lang = 'vi' and t.term = g.term_vi),
  'term_vi copied to vi rows');

-- 전환 기간 동기화: 시드처럼 term_vi로 넣으면 vi 행이 생기고, 고치면 따라온다
insert into public.glossary (id, expression, aliases, term_ko, term_vi, plain_ko, chapter, page) values
 ('e1000000-0000-0000-0000-000000000001', '합성 검증 표현', array['합성 검증'], '합성 검증 용어', 'Bản dịch thử', '검증용', '', '');
select pg_temp.check_true((select term = 'Bản dịch thử' and reviewed = false from public.glossary_translations
  where glossary_id = 'e1000000-0000-0000-0000-000000000001' and lang = 'vi'), 'sync on insert');
update public.glossary_translations set reviewed = true where glossary_id = 'e1000000-0000-0000-0000-000000000001';
update public.glossary set term_vi = 'Bản dịch mới' where id = 'e1000000-0000-0000-0000-000000000001';
select pg_temp.check_true((select term = 'Bản dịch mới' and reviewed = false from public.glossary_translations
  where glossary_id = 'e1000000-0000-0000-0000-000000000001' and lang = 'vi'), 'sync on update resets reviewed');
select pg_temp.expect_error($q$insert into public.glossary_translations(glossary_id, lang, term)
  values ('e1000000-0000-0000-0000-000000000001', 'xx', 'x')$q$, 'check');

-- 검색: lang의 번역이 term_native, 없으면 빈값, 보내지 않으면 vi
select pg_temp.check_true((select term_native = 'Bản dịch mới' and term_vi = 'Bản dịch mới'
  from public.search_glossary('합성 검증 표현', 5, 'vi')), 'term_native vi');
select pg_temp.check_true((select term_native = '' from public.search_glossary('합성 검증 표현', 5, 'ko')), 'term_native ko empty');
select pg_temp.check_true((select term_native = 'Bản dịch mới' from public.search_glossary('합성 검증 표현')), 'default lang vi');
delete from public.glossary_translations where glossary_id = 'e1000000-0000-0000-0000-000000000001';
select pg_temp.check_true((select term_native = '' from public.search_glossary('합성 검증 표현', 5, 'vi')), 'no translation → empty');
select pg_temp.check_true((select count(*) = 1 from public.search_glossary('합성 검증', 5, 'vi')), 'alias search still works');

-- 로그인한 사람 권한으로도 검색된다
insert into public.organizations(id, name) values ('e1000000-0000-0000-0000-0000000000a1', '검증 기관 번역');
insert into auth.users(id) values ('e2000000-0000-0000-0000-000000000001'), ('e2000000-0000-0000-0000-000000000002');
insert into public.profiles(id, org_id, role, name, native_lang) values
 ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a1', 'worker', '가상 작성자 번역', 'vi'),
 ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000a1', 'worker', '가상 작성자 한국어', 'ko');
insert into public.residents(id, org_id, alias, care_type) values
 ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a1', '검증○○', 'facility');
insert into public.assignments(org_id, worker_id, resident_id) values
 ('e1000000-0000-0000-0000-0000000000a1', 'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001'),
 ('e1000000-0000-0000-0000-0000000000a1', 'e2000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select pg_temp.check_true((select count(*) >= 1 from public.search_glossary('합성 검증 표현', 5, 'vi')), 'authenticated can search');
select pg_temp.check_true((select count(*) >= 1 from public.glossary_translations), 'authenticated can read translations');

-- records.native_lang: 만들 때 작성자 프로필의 언어로 채워진다(화면은 이 칸을 보내지 못함)
insert into public.records(resident_id, care_date) values
 ('e3000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Seoul')::date);
reset role;
select pg_temp.check_true((select native_lang = 'vi' from public.records
  where worker_id = 'e2000000-0000-0000-0000-000000000001'), 'native_lang from vi worker');

-- 서버(service_role)가 native_lang을 보내도 작성자 언어로 덮인다
set local role service_role;
insert into public.records(worker_id, resident_id, care_date, native_lang) values
 ('e2000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001',
  (now() at time zone 'Asia/Seoul')::date - 1, 'vi');
reset role;
select pg_temp.check_true((select native_lang = 'ko' from public.records
  where worker_id = 'e2000000-0000-0000-0000-000000000002'), 'native_lang from ko worker, sent value ignored');

-- 만든 뒤에는 바꾸지 못한다
select pg_temp.expect_error($q$update public.records set native_lang = 'ko'
  where worker_id = 'e2000000-0000-0000-0000-000000000001'$q$, 'invalid_transition');

select 'glossary-translations: all assertions passed' as result;
rollback;
