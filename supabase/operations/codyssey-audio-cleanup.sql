-- CareBridge-Codyssey (fffgpgrnppxxqccncstf) 전용 운영 설정. 공모전 DB에는 실행하지 않는다.
-- 먼저 Vault에 codyssey_audio_cleanup_token을 Vercel CRON_SECRET과 같은 값으로 저장한다.
-- 비밀 값은 이 파일에 적지 않는다. pg_cron·pg_net은 마이그레이션으로 활성화한다.
select cron.schedule(
  'codyssey-audio-cleanup', '17 * * * *',
  $job$select net.http_get(
    url := 'https://carebridge-codyssey.vercel.app/api/cron/audio-cleanup',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (
      select decrypted_secret from vault.decrypted_secrets where name = 'codyssey_audio_cleanup_token'
    )),
    timeout_milliseconds := 30000
  );$job$
);

-- 실행 이력은 7일만 보관한다. 18:37 UTC = 다음 날 03:37 KST.
select cron.schedule(
  'codyssey-cron-history-cleanup', '37 18 * * *',
  $job$delete from cron.job_run_details where end_time < now() - interval '7 days';$job$
);
