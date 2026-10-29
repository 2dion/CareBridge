-- 자동 점검(web/e2e) 정리: 지난 실행이 만든 시험 기관([E2E]로 시작)의 데이터를 지웁니다.
-- 근거: web/e2e/README.md '시험 데이터 정리'
-- 사용: 클라우드 대시보드 SQL Editor에서 통째로 한 번 실행. 여러 번 돌려도 같은 결과입니다.
--
-- 지우는 것: 이름이 '[E2E]'로 시작하고, 지금 어느 계정(profiles)도 속하지 않은 기관과 그 기관의
--           기록·항목·이력·녹음 작업·AI 작업 기록·기록 없음 처리·담당 연결·어르신·가입 코드.
-- 남기는 것: 데모 기관(시연용), 마지막 실행의 시험 기관(시험 계정이 아직 속해 있음), 시험 계정(auth.users).
-- 승인된 기록은 records_before_delete 트리거가 삭제를 막으므로(record_locked) 이 안에서만 잠시 끕니다.
-- 한 트랜잭션이라 중간에 실패해도 트리거는 꺼진 채로 남지 않습니다.

begin;

create temporary table e2e_orgs on commit drop as
select o.id
from public.organizations o
where o.name like '[E2E]%'
  and not exists (select 1 from public.profiles p where p.org_id = o.id);

alter table public.records disable trigger records_before_delete;

-- 항목·이력·녹음 작업·AI 작업 기록은 on delete cascade로 같이 지워집니다
delete from public.records where org_id in (select id from e2e_orgs);
delete from public.audio_jobs where org_id in (select id from e2e_orgs);
delete from public.no_care_days where org_id in (select id from e2e_orgs);
delete from public.assignments where org_id in (select id from e2e_orgs);
delete from public.residents where org_id in (select id from e2e_orgs) and is_synthetic;
delete from public.join_codes where org_id in (select id from e2e_orgs);
delete from public.organizations where id in (select id from e2e_orgs);

alter table public.records enable trigger records_before_delete;

commit;
