-- 다국어 확장 단계 3(이슈 #312, #308): 작성자 모국어에 중국어 간체(zh)·몽골어(mn)·영어(en)를 더한다.
-- 근거: 문서/결정/2026-11-05-모국어추가.md, 문서/설계/다국어확장-v2.0.0.md '언어 하나 더하기(단계 3)'
-- profiles.native_lang, records.native_lang, glossary_translations.lang 세 제약의 허용 값만 늘린다. 데이터는 바꾸지 않는다.
-- 코디세이 DB(fffgpgrnppxxqccncstf)에만 적용한다. 공모전 DB(CareBridge)에는 적용하지 않는다.

alter table public.profiles drop constraint profiles_native_lang_check;
alter table public.profiles add constraint profiles_native_lang_check
  check (native_lang in ('ko', 'vi', 'zh', 'mn', 'en'));

alter table public.records drop constraint records_native_lang_check;
alter table public.records add constraint records_native_lang_check
  check (native_lang in ('ko', 'vi', 'zh', 'mn', 'en'));

-- ko는 번역이 아니라 두지 않는다
alter table public.glossary_translations drop constraint glossary_translations_lang_check;
alter table public.glossary_translations add constraint glossary_translations_lang_check
  check (lang in ('vi', 'zh', 'mn', 'en'));
