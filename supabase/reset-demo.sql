-- 데모 되돌리기: 리허설 뒤 시나리오 1 어르신(김○○, 합성)의 기록을 지워 W1 카드를 '작성 전'으로 돌립니다.
-- 근거: 문서/설계/시연대본-시나리오1-v1.0.md '8. 남은 확인' 4번
-- 사용: 클라우드 대시보드 SQL Editor에서 통째로 한 번 실행. 여러 번 돌려도 같은 결과입니다.
--
-- 승인된 기록은 records_before_delete 트리거가 삭제를 막으므로(record_locked) 이 안에서만 잠시 끕니다.
-- 한 트랜잭션이라 중간에 실패해도 트리거는 꺼진 채로 남지 않습니다.
-- 항목·이력·코멘트·음성 처리·AI 작업 기록은 on delete cascade로 같이 지워집니다.
-- is_synthetic = true 인 어르신만 지웁니다(AGENTS.md 원칙 9).

begin;

alter table public.records disable trigger records_before_delete;

delete from public.records r
using public.residents p
where r.resident_id = p.id
  and p.id = '00000000-0000-4000-b000-000000000001'
  and p.is_synthetic;

alter table public.records enable trigger records_before_delete;

commit;
