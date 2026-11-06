-- 도우미 답의 언어를 만든 뒤 바꾸지 못하게 한다(이슈 #354, records.native_lang과 같은 기준).
-- service_role은 새 표에 기본으로 update 권한이 있어, 권한만으로는 서버도 고칠 수 있다. 트리거로 막는다.
-- 코디세이 DB(fffgpgrnppxxqccncstf)에만 적용한다. 공모전 DB(CareBridge)에는 적용하지 않는다.

create function private.helper_messages_keep_native_lang() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.native_lang <> old.native_lang then
    raise exception 'invalid_transition';
  end if;
  return new;
end $$;

create trigger helper_messages_keep_native_lang before update on public.helper_messages
  for each row execute function private.helper_messages_keep_native_lang();
