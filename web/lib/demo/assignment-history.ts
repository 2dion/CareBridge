// M4 담당 이력(이슈 #381). 표 assignment_history(데이터구조 v2.3.9)를 어르신 한 명 기준으로 정리한다.
import type { AssignmentHistoryEntry } from "./store";

const dayNames = ["월", "화", "수", "목", "금", "토", "일"];

/** 어르신 한 명의 이력: 지금 담당을 먼저, 그다음 시작일이 늦은 순 */
export function historyOf(
  entries: AssignmentHistoryEntry[],
  residentId: string,
): AssignmentHistoryEntry[] {
  return entries
    .filter((entry) => entry.residentId === residentId)
    .sort((a, b) => {
      if ((a.endDate === null) !== (b.endDate === null)) return a.endDate === null ? -1 : 1;
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;
      return (b.endDate ?? "").localeCompare(a.endDate ?? "");
    });
}

/** "2026-10-25 ~ 지금" / "2026-10-01 ~ 2026-10-24" */
export function historyPeriod(entry: AssignmentHistoryEntry): string {
  return `${entry.startDate} ~ ${entry.endDate ?? "지금"}`;
}

/** 재가 방문 요일 "월·수·금". 시설·요일 없음은 빈 글자 */
export function historyDays(entry: AssignmentHistoryEntry): string {
  return (entry.visitDays ?? [])
    .filter((day) => day >= 1 && day <= 7)
    .sort((a, b) => a - b)
    .map((day) => dayNames[day - 1])
    .join("·");
}
