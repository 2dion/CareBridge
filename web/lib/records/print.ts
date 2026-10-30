// 인쇄용 기록: 승인한 기록(M3)의 9개 항목과 서식 정보를 돌려준다.
// 근거: 문서/설계/데이터구조-v1.6.6.md '공통 계약' GET /api/records/:id/print, '서식 칸 대응' verified 표
// DB 호출은 PrintDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

import type { Role } from "@/lib/auth/signup";

import type { ApiResult, RecordStatus } from "./transition";

export type FormType = "16" | "12";

// 서식 칸 대응의 verified 표. 두 서식 모두 법정 원문 대조를 마쳐 verified다.
export const FORM_VERIFIED: Record<FormType, "verified" | "provisional"> = {
  "16": "verified",
  "12": "verified",
};

export type PrintItem = {
  item_key: string;
  value_ko: string;
  status: "observed" | "not_mentioned" | "needs_check";
  detail: Record<string, unknown>;
  resolution: "confirmed_by_reviewer" | "omitted" | null;
};

export type PrintRecordRow = {
  id: string;
  status: RecordStatus;
  form_type: FormType;
  form_fields: Record<string, unknown>;
  care_date: string;
  visit_start: string | null;
  visit_end: string | null;
  is_training: boolean;
};

export type PrintDeps = {
  currentUser(): Promise<{ id: string; role: Role } | null>;
  /** 로그인한 사람 권한(RLS)으로 읽음. 볼 수 없으면 null */
  findRecord(recordId: string): Promise<PrintRecordRow | null>;
  listItems(recordId: string): Promise<PrintItem[]>;
};

// GET /api/records/:id/print — 관리자·강사, approved 기록만
export async function printRecord(recordId: string, deps: PrintDeps): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return { status: 401, body: { error: "not_signed_in" } };
  if (user.role !== "reviewer") return { status: 403, body: { error: "reviewer_only" } };

  const record = await deps.findRecord(recordId);
  if (!record) return { status: 404, body: { error: "record_not_found" } };
  if (record.status !== "approved") return { status: 409, body: { error: "not_approved" } };

  return {
    status: 200,
    body: {
      id: record.id,
      care_date: record.care_date,
      visit_start: record.visit_start,
      visit_end: record.visit_end,
      form_type: record.form_type,
      form_fields: record.form_fields,
      verified: FORM_VERIFIED[record.form_type],
      is_training: record.is_training,
      items: await deps.listItems(recordId),
    },
  };
}
