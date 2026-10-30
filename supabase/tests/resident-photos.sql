-- #99: 합성 픽스처만 만들고 마지막에 전부 되돌린다. Storage 메타데이터 접근 규칙 검증(실제 파일 없음).
begin;
create function pg_temp.photo_check(ok boolean, label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.photo_error(statement text, expected text) returns void
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
 ('f1000000-0000-0000-0000-000000000001','사진 검증 기관 가'),
 ('f1000000-0000-0000-0000-000000000002','사진 검증 기관 나');
insert into auth.users(id) values
 ('f2000000-0000-0000-0000-000000000001'),('f2000000-0000-0000-0000-000000000002'),
 ('f2000000-0000-0000-0000-000000000003'),('f2000000-0000-0000-0000-000000000004');
insert into public.profiles(id,org_id,role,name,native_lang) values
 ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','worker','합성 작성자 갑','vi'),
 ('f2000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','reviewer','합성 관리자 갑','ko'),
 ('f2000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000001','worker','합성 작성자 을','vi'),
 ('f2000000-0000-0000-0000-000000000004','f1000000-0000-0000-0000-000000000002','reviewer','합성 관리자 을','ko');
insert into public.residents(id,org_id,name,care_type,photo_path) values
 ('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','김가상','facility','f1000000-0000-0000-0000-000000000001/f3000000-0000-0000-0000-000000000001/f4000000-0000-0000-0000-000000000001.jpg'),
 ('f3000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','김가상','facility','f1000000-0000-0000-0000-000000000001/f3000000-0000-0000-0000-000000000002/f4000000-0000-0000-0000-000000000002.jpg'),
 ('f3000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000002','이가상','home','f1000000-0000-0000-0000-000000000002/f3000000-0000-0000-0000-000000000003/f4000000-0000-0000-0000-000000000003.jpg');
insert into public.assignments(worker_id,resident_id) values
 ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001');
insert into storage.objects(bucket_id,name) select 'resident-photos', photo_path from public.residents where id::text like 'f3000000-%';
insert into storage.objects(bucket_id,name) values
 ('resident-photos','f1000000-0000-0000-0000-000000000001/f3000000-0000-0000-0000-000000000001/f4000000-0000-0000-0000-000000000099.jpg');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.photo_check((select count(*)=2 from public.residents where name='김가상'),'동명이인 등록');
select pg_temp.photo_check((select count(*)=2 from storage.objects where bucket_id='resident-photos' and name like 'f1000000-%'),'관리자는 내 기관 현재 사진만');
insert into public.residents(name,care_type) values ('  정가상  ','facility');
select pg_temp.photo_check((select count(*)=1 from public.residents where name='정가상' and org_id='f1000000-0000-0000-0000-000000000001'),'이름 다듬기·기관 기본값');
select pg_temp.photo_error($q$insert into public.residents(name,care_type) values (' ','facility')$q$,'residents_name_length');
select pg_temp.photo_error($q$update public.residents set photo_path=null where id='f3000000-0000-0000-0000-000000000001'$q$,'photo_server_only');
select pg_temp.photo_error($q$insert into storage.objects(bucket_id,name) values ('resident-photos','f1000000-0000-0000-0000-000000000001/f3000000-0000-0000-0000-000000000001/f4000000-0000-0000-0000-000000000098.jpg')$q$,'row-level security');
select pg_temp.photo_error($q$select * from public.record_blocked_names('f5000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001')$q$,'permission denied');

select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.photo_check((select count(*)=1 from storage.objects where bucket_id='resident-photos' and name like 'f1000000-%'),'작성자는 담당 현재 사진만');
with changed as (update public.residents set name='덮어쓰기 시도' where id='f3000000-0000-0000-0000-000000000001' returning id)
select pg_temp.photo_check((select count(*)=0 from changed),'작성자는 명단 수정 불가');

select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.photo_check((select count(*)=0 from storage.objects where bucket_id='resident-photos' and name like 'f1000000-%'),'같은 기관 미담당 작성자는 사진 불가');

select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.photo_check((select count(*)=1 from storage.objects where bucket_id='resident-photos' and name like 'f1000000-%'),'다른 기관 관리자는 자기 기관 사진만');
select pg_temp.photo_check((select count(*)=0 from public.residents where id='f3000000-0000-0000-0000-000000000001'),'다른 기관 명단 차단');

reset role;
select pg_temp.photo_error($q$update public.residents set photo_path='f1000000-0000-0000-0000-000000000002/f3000000-0000-0000-0000-000000000001/f4000000-0000-0000-0000-000000000001.jpg' where id='f3000000-0000-0000-0000-000000000001'$q$,'residents_photo_path');
update public.residents set photo_path=null where id='f3000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.photo_check((select count(*)=0 from storage.objects where bucket_id='resident-photos' and name like '%/f3000000-0000-0000-0000-000000000001/%'),'삭제 후 옛 파일 메타데이터가 남아도 읽기 차단');
reset role;
select 'resident-photos: all assertions passed' as result;
rollback;
