import { reviewQueue, wasResent } from "./review";
import { countUnresolved } from "./state";
import { type DemoDb, lateDays, listMissed, listOverdue, returnedRecords } from "./store";

export function elapsedReturnDays(at: string, now: number): number {
  const elapsed = now - Date.parse(at);
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86400000)) : 0;
}

/** M0/M1/메뉴는 같은 검토 대기 자료를 센다. 새로운 API·상태 값은 없다. */
export function overviewCounts(db: DemoDb, today: string, now: number) {
  const waiting = reviewQueue(db);
  const returned = returnedRecords(db);
  return {
    waiting: waiting.length,
    resent: waiting.filter(wasResent).length,
    late: waiting.filter((record) => (lateDays(record) ?? 0) > 0).length,
    noUnresolved: waiting.filter((record) => countUnresolved(record.items) === 0).length,
    returned: returned.length,
    returnedOver48h: returned.filter((record) =>
      record.returnedAt ? now - Date.parse(record.returnedAt) > 48 * 3600000 : false,
    ).length,
    missed: listMissed(db, today).length,
    overdue: listOverdue(db, today).length,
  };
}
