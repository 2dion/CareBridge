// 로그인한 사람 권한(RLS)으로 화면에 필요한 줄을 읽어 DemoDb 모양으로 바꾼다.
// 근거: 문서/설계/데이터구조-v1.7.md '권한 규칙'·'공통 계약'(목록·상세는 Supabase에서 RLS로 바로 읽음, 못 쓴 기록·기한 지난 빈 기록은 DB 함수)
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DemoDb, MissedRecord, OverdueDay } from "../demo/store";
import {
  activeJoinCodes,
  type AssignmentRow,
  type AudioJobRow,
  type EventRow,
  type ItemRow,
  type JoinCode,
  type JoinCodeRow,
  type NoCareRow,
  type ProfileRow,
  type RecordRow,
  type ResidentRow,
  type StaffRow,
  toDemoDb,
} from "./map";

export class NotSignedInError extends Error {
  constructor() {
    super("not_signed_in");
    this.name = "NotSignedInError";
  }
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

const byDateDesc = (a: { careDate: string }, b: { careDate: string }) =>
  a.careDate === b.careDate ? 0 : a.careDate < b.careDate ? 1 : -1;

export async function loadRealDb(
  supabase: SupabaseClient,
  today: string,
): Promise<{
  db: DemoDb;
  role: "worker" | "reviewer";
  userId: string;
  isTraining: boolean;
  nativeLang: "ko" | "vi";
  /** M5 설정: 내 기관의 켜진 가입 코드. 관리자만 읽고(RLS), 작성자는 빈 목록 */
  joinCodes: JoinCode[];
}> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new NotSignedInError();
  const { data: me, error } = await supabase
    .from("profiles")
    .select("id, role, name, native_lang, font_size, onboarded, organizations(name, is_training)")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error || !me) throw new NotSignedInError();
  const org = (me as unknown as { organizations: { name: string; is_training: boolean } | null })
    .organizations;
  const profile: ProfileRow = {
    id: me.id,
    role: me.role,
    name: me.name,
    native_lang: me.native_lang,
    font_size: me.font_size,
    onboarded: me.onboarded,
    org_name: org?.name ?? "",
    email: auth.user.email ?? "",
  };
  const reviewer = profile.role === "reviewer";

  const [
    staff,
    residents,
    assignments,
    records,
    noCareDays,
    missedRows,
    overdueRows,
    joinCodeRows,
  ] = await Promise.all([
    reviewer ? rows<StaffRow>(supabase.rpc("list_org_staff")) : Promise.resolve([]),
    rows<ResidentRow>(supabase.from("residents").select("id, name, photo_path, care_type")),
    rows<AssignmentRow>(
      supabase
        .from("assignments")
        .select("resident_id, worker_id, visit_days, start_date, schedule"),
    ),
    rows<RecordRow>(
      supabase
        .from("records")
        .select(
          "id, resident_id, worker_id, care_date, form_type, status, transcript, transcript_ko, visit_start, visit_end, form_fields, return_reason, return_reason_native, submitted_at, approved_at, approved_by, created_at",
        ),
    ),
    rows<NoCareRow>(
      supabase.from("no_care_days").select("resident_id, care_date, reason, note, created_by"),
    ),
    rows<{
      worker_id: string;
      resident_id: string;
      care_date: string;
      kind: "missing" | "draft";
      record_id: string | null;
    }>(supabase.rpc("list_missed_records")),
    reviewer
      ? rows<{ resident_id: string; care_date: string }>(supabase.rpc("list_overdue_records"))
      : Promise.resolve([]),
    // 가입 코드는 기관의 join_codes에서 읽기만 한다(이슈 #119). 화면 코드에 고정값을 두지 않는다
    reviewer
      ? rows<JoinCodeRow>(
          supabase.from("join_codes").select("code, role, active").eq("active", true),
        )
      : Promise.resolve([]),
  ]);

  const ids = records.map((record) => record.id);
  const [items, events, jobs] = ids.length
    ? await Promise.all([
        rows<ItemRow>(
          supabase
            .from("record_items")
            .select(
              "record_id, item_key, value_ko, value_native, status, evidence, reason, reason_native, source, confirmed_by_worker, resolution, resolution_note, detail",
            )
            .in("record_id", ids),
        ),
        rows<EventRow>(
          supabase
            .from("record_events")
            .select("record_id, actor_id, type, item_key, before, after, created_at")
            .in("record_id", ids),
        ),
        rows<AudioJobRow>(
          supabase
            .from("audio_jobs")
            .select("record_id, target, status, created_at")
            .in("record_id", ids),
        ),
      ])
    : [[], [], []];

  const db = toDemoDb(
    { profile, staff, residents, assignments, records, items, events, jobs, noCareDays },
    today,
  );
  // 못 쓴 기록은 작성자마다 한 줄이다(assignments 기준). 이름을 붙여 M1이 작성자별로 보인다(이슈 #95)
  const staffNames = new Map(staff.map((person) => [person.id, person.name]));
  const missed: MissedRecord[] = missedRows
    .map((row) => ({
      residentId: row.resident_id,
      careDate: row.care_date,
      kind: row.kind,
      ...(row.record_id ? { recordId: row.record_id } : {}),
      workerId: row.worker_id,
      workerName: staffNames.get(row.worker_id) ?? (reviewer ? "" : profile.name),
    }))
    .sort(byDateDesc);
  const overdue: OverdueDay[] = overdueRows
    .map((row) => ({ residentId: row.resident_id, careDate: row.care_date }))
    .sort(byDateDesc);
  return {
    db: { ...db, missed, ...(reviewer ? { overdue } : {}) },
    role: profile.role,
    userId: profile.id,
    isTraining: Boolean(org?.is_training),
    nativeLang: profile.native_lang === "ko" ? "ko" : "vi",
    joinCodes: activeJoinCodes(joinCodeRows),
  };
}
