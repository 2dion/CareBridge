import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { toFormType } from "./form-type";
import type { PeriodPrintDeps, PeriodRecordRow, PeriodResident } from "./period-print";
import type { PrintItem } from "./print";
import { listOrgStaff } from "./profiles";
import { readCurrentUser } from "./transition-supabase";

/** 오늘의 한국 날짜(YYYY-MM-DD). records.care_date와 같은 기준 */
export function kstToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

// 기간 인쇄의 DB 호출. 모두 로그인한 사람 권한(RLS)으로 읽는다(관리자·강사는 같은 기관 어르신·기록·기록 없음 처리를 읽을 수 있다).
export async function createPeriodPrintDeps(): Promise<PeriodPrintDeps> {
  const supabase = await createSupabaseServerClient();

  return {
    currentUser: () => readCurrentUser(supabase),
    async findResident(residentId) {
      const { data } = await supabase
        .from("residents")
        .select("id, name, care_type, organizations(is_training)")
        .eq("id", residentId)
        .maybeSingle();
      if (!data) return null;
      const row = data as unknown as Omit<PeriodResident, "is_training"> & {
        organizations: { is_training: boolean } | null;
      };
      return {
        id: row.id,
        name: row.name,
        care_type: row.care_type,
        is_training: Boolean(row.organizations?.is_training),
      };
    },
    async listRecords(residentId, from, to) {
      const { data, error } = await supabase
        .from("records")
        .select("id, status, form_type, form_fields, care_date, visit_start, visit_end, worker_id")
        .eq("resident_id", residentId)
        .gte("care_date", from)
        .lte("care_date", to)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`기간 기록 조회 실패: ${error.message}`);
      // DB의 form_type은 smallint라 숫자로 온다. 계약은 "16" / "12" 글자
      return ((data ?? []) as (Omit<PeriodRecordRow, "form_type"> & { form_type: unknown })[]).map(
        (row) => ({ ...row, form_type: toFormType(row.form_type) }),
      );
    },
    async listItems(recordIds) {
      if (recordIds.length === 0) return [];
      const { data, error } = await supabase
        .from("record_items")
        .select("record_id, item_key, value_ko, status, detail, resolution")
        .in("record_id", recordIds);
      if (error) throw new Error(`기록 항목 조회 실패: ${error.message}`);
      return (data ?? []) as (PrintItem & { record_id: string })[];
    },
    async listNoCareDays(residentId, from, to) {
      const { data, error } = await supabase
        .from("no_care_days")
        .select("care_date")
        .eq("resident_id", residentId)
        .gte("care_date", from)
        .lte("care_date", to);
      if (error) throw new Error(`기록 없음 처리 조회 실패: ${error.message}`);
      return ((data ?? []) as { care_date: string }[]).map((row) => row.care_date);
    },
    async workerNames(workerIds) {
      if (workerIds.length === 0) return {};
      const wanted = new Set(workerIds);
      const staff = await listOrgStaff(supabase);
      return Object.fromEntries(
        staff.filter((person) => wanted.has(person.id)).map((person) => [person.id, person.name]),
      );
    },
    today: () => kstToday(),
  };
}
