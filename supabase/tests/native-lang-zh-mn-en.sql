-- 이슈 #312: native_lang·lang 제약이 zh·mn·en을 받고 모르는 값은 막는지 검사한다.
-- 적용된 DB에서 실행하고, 제약 정의만 읽으므로 데이터는 바꾸지 않는다.
begin;
create function pg_temp.check_true(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;

select pg_temp.check_true(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_native_lang_check')
    ~ '''ko''.*''vi''.*''zh''.*''mn''.*''en''', 'profiles.native_lang allows ko vi zh mn en');
select pg_temp.check_true(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'records_native_lang_check')
    ~ '''ko''.*''vi''.*''zh''.*''mn''.*''en''', 'records.native_lang allows ko vi zh mn en');
select pg_temp.check_true(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'glossary_translations_lang_check')
    ~ '''vi''.*''zh''.*''mn''.*''en''', 'glossary_translations.lang allows vi zh mn en');
-- ko는 번역이 아니라 용어 번역 표에 두지 않는다
select pg_temp.check_true(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'glossary_translations_lang_check')
    !~ '''ko''', 'glossary_translations.lang rejects ko');
-- 목록에 없는 값(번체 등 따로 코드를 만들지 않은 언어)은 여전히 막는다
select pg_temp.check_true(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_native_lang_check')
    !~ '''th''', 'profiles.native_lang rejects unlisted code');
rollback;
