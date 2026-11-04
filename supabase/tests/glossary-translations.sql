-- 이슈 #259·#280: glossary_translations·search_glossary(lang)·records.native_lang 검사. term_vi 칸은 없다.
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

-- 뒷정리(#280): term_vi 칸과 동기화 트리거가 없고, 검색 결과에도 term_vi가 없다
select pg_temp.check_true((select count(*) = 0 from information_schema.columns
  where table_schema = 'public' and table_name = 'glossary' and column_name = 'term_vi'), 'term_vi column dropped');
select pg_temp.check_true((select count(*) = 0 from pg_trigger where tgname = 'glossary_sync_term_vi'), 'sync trigger dropped');
select pg_temp.check_true((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'glossary_sync_term_vi'), 'sync function dropped');
select pg_temp.check_true(
  (select string_agg(a.attname, ',' order by a.attnum) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargnames) with ordinality as a(attname, attnum)
   where n.nspname = 'public' and p.proname = 'search_glossary' and p.pronargs = 3)
  = 'expression,max_results,lang,id,matched_expression,term_ko,term_native,plain_ko,chapter,page',
  'search_glossary columns without term_vi');

-- 시드로 들어간 번역이 있다(vi 행 ≥ 1)
select pg_temp.check_true((select count(*) >= 1 from public.glossary_translations where lang = 'vi'), 'vi rows exist');

-- 검색: lang의 번역이 term_native, 없으면 빈값, 보내지 않으면 vi
insert into public.glossary (id, expression, aliases, term_ko, plain_ko, chapter, page) values
 ('e1000000-0000-0000-0000-000000000001', '합성 검증 표현', array['합성 검증'], '합성 검증 용어', '검증용', '', '');
insert into public.glossary_translations (glossary_id, lang, term) values
 ('e1000000-0000-0000-0000-000000000001', 'vi', 'Bản dịch thử');
select pg_temp.check_true((select term_native = 'Bản dịch thử'
  from public.search_glossary('합성 검증 표현', 5, 'vi')), 'term_native vi');
select pg_temp.check_true((select term_native = '' from public.search_glossary('합성 검증 표현', 5, 'ko')), 'term_native ko empty');
select pg_temp.check_true((select term_native = 'Bản dịch thử' from public.search_glossary('합성 검증 표현')), 'default lang vi');
select pg_temp.expect_error($q$insert into public.glossary_translations(glossary_id, lang, term)
  values ('e1000000-0000-0000-0000-000000000001', 'xx', 'x')$q$, 'check');
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
