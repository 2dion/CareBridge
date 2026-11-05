// M3 · 기간 인쇄의 화면 데이터. 실제 모드는 서버 응답만, Mock은 같은 승인·서식 규칙을 쓴다.
import type { CareType, DemoDb, DemoRecord } from "@/lib/demo/store";
import { applyPrintData, type PrintData } from "@/lib/real/map";
import { addDays, daysBetween } from "@/lib/records/period-print";
import { legalForms, printableItem, type NoteArea } from "./fields";

export type PeriodView = {
  residentId: string;
  from: string;
  to: string;
  formType: "12" | "16";
  training: boolean;
  days: { date: string; record: DemoRecord | null; skipped: string }[];
};
export type PeriodResponse = {
  resident: { id: string; name: string };
  from: string;
  to: string;
  form_type: "12" | "16";
  is_training: boolean;
  days: {
    care_date: string;
    skipped: string;
    record: (PrintData & { id: string; care_date: string; worker_name: string }) | null;
  }[];
};
export const skipLabels: Record<string, string> = {
  not_approved: "승인 전이라 뺌",
  no_care_day: "기록 없음 처리한 날",
  no_record: "기록 없음",
  other_form: "다른 서식이라 뺌",
};
export function periodStart(date: string, formType: "12" | "16", detail = false) {
  if (formType === "16") return detail ? date : addDays(date, -2);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function periodHref(record: DemoRecord, careType: CareType) {
  // 기간 인쇄는 어르신의 지금 급여 종류로 서식을 정한다.
  const formType = careType === "home" ? "12" : "16";
  return `/print/period?resident=${encodeURIComponent(record.residentId)}&from=${periodStart(record.careDate, formType, true)}`;
}
/** to가 없으면 서식 한 장 분량. 있으면 from~to(서식 장 수는 PDF를 만들 때 나눈다, 이슈 #317) */
export function mockPeriod(db: DemoDb, residentId: string, from: string, to?: string): PeriodView {
  const resident = db.residents.find((entry) => entry.id === residentId)!;
  const formType = resident.careType === "home" ? "12" : "16";
  const length = to ? Math.max(1, daysBetween(from, to)) : legalForms[formType].days;
  const days = Array.from({ length }, (_, column) => {
    const date = addDays(from, column);
    const records = Object.values(db.records).filter(
      (record) => record.residentId === residentId && record.careDate === date,
    );
    const matching = records.filter((record) => record.formType === formType);
    const record = matching.find((record) => record.status === "approved") ?? null;
    const skipped = record
      ? ""
      : matching.length
        ? "not_approved"
        : records.length
          ? "other_form"
          : db.noCareDays.some((day) => day.residentId === residentId && day.careDate === date)
            ? "no_care_day"
            : "no_record";
    return { date, record, skipped };
  });
  return { residentId, formType, from, to: days.at(-1)!.date, training: false, days };
}
export function serverPeriod(data: PeriodResponse): PeriodView {
  return {
    residentId: data.resident.id,
    formType: data.form_type,
    from: data.from,
    to: data.to,
    training: data.is_training,
    days: data.days.map((day) => {
      const raw = day.record;
      if (!raw) return { date: day.care_date, record: null, skipped: day.skipped };
      // 서버에서 받은 항목만 사용한다. 화면 캐시의 옛 항목이 PDF에 섞이지 않는다.
      const base: DemoRecord = {
        id: raw.id,
        residentId: data.resident.id,
        careDate: day.care_date,
        formType: data.form_type,
        status: "approved",
        draftState: "ready",
        inputMode: null,
        transcript: "",
        transcriptKo: "",
        items: raw.items.map((item) => ({
          ...item,
          detail: item.detail ?? {},
          value_native: "",
          evidence: "",
          reason: "",
          source: "reviewer",
          confirmed_by_worker: true,
        })),
        returnReason: "",
        returnReasonNative: "",
        returnedBy: "",
        returnedAt: null,
        firstSubmittedAt: null,
        submittedAt: null,
        approvedAt: null,
        approvedBy: "",
        updatedAt: "",
        events: [],
        workerName: raw.worker_name,
      };
      return { date: day.care_date, record: applyPrintData(base, raw), skipped: "" };
    }),
  };
}
export function missingAreas(view: PeriodView, areas: Record<string, NoteArea | "">) {
  return (
    view.formType === "16" &&
    view.days.some(
      (day) =>
        day.record && printableItem(day.record, "notes")?.value_ko.trim() && !areas[day.date],
    )
  );
}
