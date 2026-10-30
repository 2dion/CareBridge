-- #99: 명단 실명·선택 사진. 사진 원본은 저장하지 않고 서버가 검사·변환한 JPEG만 보관한다.
alter table public.residents add column name text;
update public.residents set name = alias;
alter table public.residents alter column name set not null;
alter table public.residents alter column name set default '';
alter table public.residents alter column alias set default '';
alter table public.residents add column photo_path text;
alter table public.residents add constraint residents_name_length
  check (length(btrim(name)) between 1 and 80);
alter table public.residents add constraint residents_photo_path
  check (photo_path is null or (
    photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and split_part(photo_path, '/', 1) = org_id::text
    and split_part(photo_path, '/', 2) = id::text
  ));
create index residents_photo_path_idx on public.residents(photo_path) where photo_path is not null;

-- 구버전의 alias-only INSERT는 허용한다. 실명은 임의로 만들지 않는다.
create function private.residents_guard_photo() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' and btrim(new.name) = '' then
    new.name := new.alias;
  end if;
  new.name := btrim(new.name);
  if current_user in ('authenticated', 'anon') then
    if (tg_op = 'INSERT' and new.photo_path is not null)
       or (tg_op = 'UPDATE' and new.photo_path is distinct from old.photo_path) then
      raise exception 'photo_server_only';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.residents_guard_photo() from public, anon, authenticated;
create trigger residents_guard_photo before insert or update on public.residents
  for each row execute function private.residents_guard_photo();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('resident-photos', 'resident-photos', false, 3145728, array['image/jpeg']);

-- 명단 RLS를 그대로 적용: 관리자=내 기관, 작성자=담당 연결. 현재 경로만 읽는다.
-- 클라이언트의 INSERT/UPDATE/DELETE 정책은 만들지 않는다. 서버 검증 우회 업로드 금지.
create policy resident_photos_select on storage.objects for select to authenticated
using (
  bucket_id = 'resident-photos'
  and exists (
    select 1 from public.residents r
    where r.photo_path = storage.objects.name
      and r.org_id = (select private.my_org_id())
  )
);


-- 이름 목록은 기존과 같이 서버 전용. 새로 보관하는 어르신 실명도 출력 검사에 포함한다.
create or replace function public.record_blocked_names(p_record_id uuid, p_worker_id uuid)
returns table (name text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.records r join public.profiles p on p.id = r.worker_id
    where r.id = p_record_id and r.worker_id = p_worker_id and p.role = 'worker'
      and p.org_id = r.org_id and r.status in ('draft', 'returned')
  ) then raise exception 'not_record_worker'; end if;
  return query
    select p.name from public.profiles p join public.records r on r.org_id = p.org_id where r.id = p_record_id
    union
    select resident.name from public.residents resident join public.records r on r.org_id = resident.org_id where r.id = p_record_id;
end $$;
revoke all on function public.record_blocked_names(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_blocked_names(uuid, uuid) to service_role;

-- M4는 기관 id를 보내지 않는다. 로그인한 기관을 DB가 채우고 기존 RLS가 검증한다.
alter table public.residents alter column org_id set default private.my_org_id();
