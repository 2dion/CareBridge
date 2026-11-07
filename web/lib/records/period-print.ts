// 기간 인쇄(M3 · 기간 인쇄): 한 어르신의 승인한 기록 여러 날을 법정 원문 한 장(제12호 7일, 제16호 3일)의 날짜 열에 모아 찍기 위한 데이터.
// 근거: 문서/결정/2026-11-03-기간인쇄.md, 문서/설계/데이터구조-v2.3.10.md '공통 계약' GET /api/residents/:id/print
// 승인 완료(approved) 기록만 채우고, 나머지 날은 뺀 이유(skipped)만 준다. PDF 모양은 화면(web/lib/print)이 만든다.
// DB 호출은 PeriodPrintDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

import type { Role } from "@/lib/auth/signup";

import { FORM_VERIFIED, type FormType, type PrintItem } from "./print";
import type { ApiResult, RecordStatus } from "./transition";

/** 원문 1장의 날짜 열 수(서식 칸 대응 '1장 단위') */
export const DAYS_PER_SHEET: Record<FormType, number> = { "12": 7, "16": 3 };

/** 기간 인쇄 한 번에 찍을 수 있는 가장 긴 기간(일). 넘으면 서식 장이 너무 많아진다(제16호 11장) */
export const MAX_PERIOD_DAYS = 31;

export type SkipReason = "not_approved" | "no_care_day" | "no_record" | "other_form";

export type PeriodResident = {
  id: string;
  name: string;
  care_type: "facility" | "home";
  is_training: boolean;
};

export type PeriodRecordRow = {
  id: string;
  status: RecordStatus;
  form_type: FormType;
  form_fields: Record<string, unknown>;
  care_date: string;
  visit_start: string | null;
  visit_end: string | null;
  worker_id: string;
};

export type PeriodPrintDeps = {
  currentUser(): Promise<{ id: string; role: Role } | null>;
  /** 로그인한 사람 권한(RLS)으로 읽음. 같은 기관 어르신이 아니면 null */
  findResident(residentId: string): Promise<PeriodResident | null>;
  /** from~to(둘 다 포함)의 기록. 작성자가 여럿이면 여러 줄일 수 있다 */
  listRecords(residentId: string, from: string, to: string): Promise<PeriodRecordRow[]>;
  listItems(recordIds: string[]): Promise<(PrintItem & { record_id: string })[]>;
  /** from~to의 기록 없음 처리(no_care_days) 날짜 */
  listNoCareDays(residentId: string, from: string, to: string): Promise<string[]>;
  /** 작성자 id → 이름(list_org_staff). 모르는 id는 빠진다 */
  workerNames(workerIds: string[]): Promise<Record<string, string>>;
  /** 오늘(한국 날짜, YYYY-MM-DD) */
  today(): string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD가 실제 있는 날짜인지 */
export function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** 날짜에 n일을 더한다(시간대 영향 없음) */
export function addDays(date: string, n: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + n);
  return parsed.toISOString().slice(0, 10);
}

/** from부터 to까지 며칠인지(둘 다 포함). to가 앞서면 0 이하 */
export function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export const formTypeOfCare = (careType: PeriodResident["care_type"]): FormType =>
  careType === "home" ? "12" : "16";

// GET /api/residents/:id/print?from=YYYY-MM-DD&to=YYYY-MM-DD — 관리자·강사. 어르신 1명 + 서식 1개(지금 care_type) + 기간
// to는 선택. 없으면 서식 한 장(제12호 7일, 제16호 3일). 길면 화면이 날짜 수마다 새 서식 장으로 나눈다(결정 2026-11-05-기간인쇄여러장)
export async function printPeriod(
  residentId: string,
  from: string | null,
  deps: PeriodPrintDeps,
  requestedTo: string | null = null,
): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return { status: 401, body: { error: "not_signed_in" } };
  if (user.role !== "reviewer") return { status: 403, body: { error: "reviewer_only" } };

  // 시작 날짜는 필수이고 오늘(한국)보다 뒤일 수 없다
  if (!from || !isValidDate(from) || from > deps.today()) {
    return { status: 400, body: { error: "invalid_input" } };
  }

  // 끝 날짜는 시작 날짜 이후이고, 시작 날짜부터 31일 안이어야 한다(이슈 #317)
  if (requestedTo !== null) {
    const span = isValidDate(requestedTo) ? daysBetween(from, requestedTo) : 0;
    if (span < 1 || span > MAX_PERIOD_DAYS) {
      return { status: 400, body: { error: "invalid_input" } };
    }
  }

  const resident = await deps.findResident(residentId);
  if (!resident) return { status: 404, body: { error: "resident_not_found" } };

  const formType = formTypeOfCare(resident.care_type);
  const to = requestedTo ?? addDays(from, DAYS_PER_SHEET[formType] - 1);
  const dayCount = daysBetween(from, to);
  const [records, noCareDays] = await Promise.all([
    deps.listRecords(residentId, from, to),
    deps.listNoCareDays(residentId, from, to),
  ]);

  // 날마다 찍을 기록 하나를 고른다: 지금 서식의 approved 기록
  const chosen = new Map<string, PeriodRecordRow>();
  const skipped = new Map<string, SkipReason>();
  for (const record of records) {
    if (record.care_date < from || record.care_date > to) continue;
    if (chosen.has(record.care_date)) continue;
    if (record.form_type !== formType) {
      // 다른 서식은 이 장에 넣을 수 없다. 같은 날 지금 서식의 기록이 있으면 그것이 이긴다
      if (!skipped.has(record.care_date)) skipped.set(record.care_date, "other_form");
      continue;
    }
    if (record.status !== "approved") {
      skipped.set(record.care_date, "not_approved");
      continue;
    }
    chosen.set(record.care_date, record);
    skipped.delete(record.care_date);
  }
  if (chosen.size === 0) return { status: 409, body: { error: "not_approved" } };

  const chosenRows = [...chosen.values()];
  const [items, names] = await Promise.all([
    deps.listItems(chosenRows.map((record) => record.id)),
    deps.workerNames([...new Set(chosenRows.map((record) => record.worker_id))]),
  ]);
  const noCare = new Set(noCareDays);

  const days = [];
  for (let offset = 0; offset < dayCount; offset++) {
    const careDate = addDays(from, offset);
    const record = chosen.get(careDate);
    if (record) {
      days.push({
        care_date: careDate,
        record: {
          id: record.id,
          care_date: record.care_date,
          visit_start: record.visit_start,
          visit_end: record.visit_end,
          form_type: record.form_type,
          form_fields: record.form_fields,
          verified: FORM_VERIFIED[record.form_type],
          is_training: resident.is_training,
          items: items
            .filter((item) => item.record_id === record.id)
            .map(({ item_key, value_ko, status, detail, resolution }) => ({
              item_key,
              value_ko,
              status,
              detail,
              resolution,
            })),
          worker_name: names[record.worker_id] ?? "",
        },
        skipped: "" as const,
      });
      continue;
    }
    const reason: SkipReason =
      skipped.get(careDate) ?? (noCare.has(careDate) ? "no_care_day" : "no_record");
    days.push({ care_date: careDate, record: null, skipped: reason });
  }

  return {
    status: 200,
    body: {
      resident: { id: resident.id, name: resident.name },
      form_type: formType,
      from,
      to,
      days_per_sheet: DAYS_PER_SHEET[formType],
      verified: FORM_VERIFIED[formType],
      is_training: resident.is_training,
      days,
    },
  };
}
