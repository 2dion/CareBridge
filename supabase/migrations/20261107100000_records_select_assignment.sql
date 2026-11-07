-- 이슈 #367: 담당이 끝난 작성자에게 그 어르신의 끝난 기록(submitted·approved·commented)을 보이지 않는다.
-- 근거: 문서/결정/2026-11-07-담당끝난기록숨김.md, 문서/설계/데이터구조-v2.3.8.md 권한 규칙 records
--
-- 작성자가 읽는 기록 = (지금 담당인 어르신의 자기 기록) 또는 (담당과 상관없이 draft·returned인 자기 기록).
-- 담당 행(assignments)은 지우지 않고 읽기만 막으므로, 다시 연결하면 다시 보인다. 관리자·강사 읽기는 그대로.
-- record_items·record_events·comments는 정책이 "기록을 볼 수 있으면"(exists records)이라 이 정책을 그대로 따른다.
-- 녹음 Storage(can_use_audio_path)는 이미 내 draft·returned 기록만 허용한다. security invoker 함수
-- (list_missed_records·list_overdue_records·record_late_submit)는 호출한 사람의 RLS를 따른다.
-- 코디세이 DB(fffgpgrnppxxqccncstf)에만 적용한다. 공모전 DB(CareBridge)에는 적용하지 않는다.

drop policy records_select on public.records;
create policy records_select on public.records for select to authenticated
  using (
    org_id = private.my_org_id()
    and (
      private.is_reviewer()
      or (
        worker_id = auth.uid()
        and (
          status in ('draft', 'returned')
          or exists (
            select 1 from public.assignments a
            where a.resident_id = records.resident_id and a.worker_id = auth.uid()
          )
        )
      )
    )
  );

-- audio_jobs: 올린 작성자는 읽을 수 있는 기록의 작업만(도우미 질문은 record_id가 없어 그대로). 관리자·강사는 같은 기관 전체
drop policy audio_jobs_select on public.audio_jobs;
create policy audio_jobs_select on public.audio_jobs for select to authenticated
  using (
    org_id = private.my_org_id()
    and (
      private.is_reviewer()
      or (
        worker_id = auth.uid()
        and (
          record_id is null
          or exists (select 1 from public.records r where r.id = audio_jobs.record_id)
        )
      )
    )
  );

-- 보내기(draft·returned → submitted): 담당이 끝난 작성자도 자기 draft·returned를 보낼 수 있어야 한다.
-- UPDATE는 바뀐 새 행도 읽기 정책(records_select)으로 검사하는데 submitted는 담당이 끝나면 숨으므로, 직접 UPDATE는 거절된다.
-- 그래서 보내기만 이 함수(security definer)로 한다. 기록의 작성자 본인(worker_id = auth.uid())만 되고,
-- 상태 변화 검사 트리거(records_before_update)는 호출한 사람의 auth.uid()로 그대로 돈다.
create function public.submit_own_record(p_record_id uuid, p_from text)
returns table (status text, submitted_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or p_from not in ('draft', 'returned') then
    return;
  end if;
  return query
    update public.records r
    set status = 'submitted'
    where r.id = p_record_id and r.worker_id = auth.uid() and r.status = p_from
    returning r.status, r.submitted_at;
end $$;

revoke execute on function public.submit_own_record(uuid, text) from public, anon;
grant execute on function public.submit_own_record(uuid, text) to authenticated, service_role;
comment on function public.submit_own_record(uuid, text) is
  '작성자 본인의 draft·returned 기록을 보냄(이슈 #367). 담당이 끝나 submitted가 숨는 작성자도 보낼 수 있게 security definer';
