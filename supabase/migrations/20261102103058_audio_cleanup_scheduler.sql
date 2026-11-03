-- 녹음 자동 정리의 예약·HTTP 호출 기반. 실제 URL·비밀 값·예약은 환경별 운영 설정으로 둔다.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
