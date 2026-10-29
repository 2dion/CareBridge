// W4 상세(승인·전송 완료 기록)의 항목 배지(이슈 #98).
// '확인 필요'(needs_check) 항목에 관리자가 [확인함]/[기록 안 함]을 골랐으면(resolution) 그 결과를 보이고,
// 아직 고르지 않았을 때만 '확인 필요'를 보인다. 승인된 기록은 모두 골라져 있으므로 '확인 필요'가 남지 않는다(원칙 3).
// 글자는 M3 '(관리자 확인함)'과 같고, 교육용 기관이면 roleNames가 '강사'를 준다.
import type { RoleNames } from "@/lib/demo/roles";
import type { ItemStatus, Resolution } from "@/lib/demo/state";

export type ItemBadge = {
  kind: "needs_check" | "confirmed" | "omitted";
  ko: string;
  /** 병기 줄. '확인 필요'는 배지만 있어 null(상태 배지는 한국어만) */
  vi: string | null;
  tone: "orange" | "green" | "gray";
};

/** 베트남어 역할 이름은 소문자(người quản lý)라 문장 머리에서는 첫 글자를 대문자로 */
export function capitalizeVi(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function itemBadge(
  item: { status: ItemStatus; resolution: Resolution },
  names: RoleNames,
): ItemBadge | null {
  if (item.status !== "needs_check") return null;
  if (item.resolution === "confirmed_by_reviewer") {
    return {
      kind: "confirmed",
      ko: `${names.reviewer} 확인함`,
      vi: `${capitalizeVi(names.reviewerVi)} đã xác nhận`,
      tone: "green",
    };
  }
  if (item.resolution === "omitted") {
    return {
      kind: "omitted",
      ko: `${names.reviewer} 기록 안 함`,
      vi: `${capitalizeVi(names.reviewerVi)} không ghi`,
      tone: "gray",
    };
  }
  return { kind: "needs_check", ko: "확인 필요", vi: null, tone: "orange" };
}

/** "이름 · 메모" 한 줄. 메모가 비면 점(·)을 남기지 않는다(이슈 #98 QA 메모). */
export function withNote(label: string, note?: string | null): string {
  const trimmed = note?.trim();
  return trimmed ? `${label} · ${trimmed}` : label;
}
