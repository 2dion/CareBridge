"use client";

// M1(검토 대기): 받은 시각이 오래된 순. 현황·누락 처리는 M0으로 이동(#148).
// 재전송 기록(되돌린 뒤 다시 전송한 기록)은 어르신 이름 옆에 ↻ 아이콘(10/28 알림표시 결정).
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { DeskShell, receivedLabel } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import { reviewQueue, wasResent } from "@/lib/demo/review";
import { countUnresolved } from "@/lib/demo/state";
import { addDays, getResident, lateDays, monthDayWeek, timeRangeLabel } from "@/lib/demo/store";

type DateFilter = "7" | "today" | "all";
type CareFilter = "all" | "facility" | "home";

export default function ReviewQueuePage() {
  return (
    <DeskShell active="review">
      <ReviewQueue />
    </DeskShell>
  );
}

function ReviewQueue() {
  const router = useRouter();
  const demo = useDemo()!;
  const { db, today } = demo;
  const names = useRoleNames();
  // 작성자 걸러 보기: 실제 모드는 기관 작성자 전부(list_org_staff), Mock은 한 명(이슈 #95)
  const workerNames = db.staff
    ? db.staff.filter((person) => person.role === "worker").map((person) => person.name)
    : [db.worker.name];
  const [worker, setWorker] = useState("all");
  const [dates, setDates] = useState<DateFilter>("all");
  const [care, setCare] = useState<CareFilter>("all");
  const from = dates === "today" ? today : dates === "7" ? addDays(today, -7) : "0000-00-00";
  const rows = reviewQueue(db).filter((record) => {
    const resident = getResident(db, record.residentId);
    if (care !== "all" && resident?.careType !== care) return false;
    if (worker !== "all" && worker !== (record.workerName ?? db.worker.name)) return false;
    return record.careDate >= from;
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>검토 대기</h1>
          <p>받은 시각이 오래된 기록부터 보여 줘요.</p>
        </div>
      </header>
      <div className="filters">
        <select
          className="select"
          aria-label={names.worker}
          value={worker}
          onChange={(event) => setWorker(event.target.value)}
        >
          <option value="all">{names.worker} · 전체</option>
          {workerNames.map((name) => (
            <option key={name} value={name}>
              {names.worker} · {name}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label="날짜"
          value={dates}
          onChange={(event) => setDates(event.target.value as DateFilter)}
        >
          <option value="7">날짜 · 최근 7일</option>
          <option value="today">날짜 · 오늘</option>
          <option value="all">날짜 · 전체</option>
        </select>
        <select
          className="select"
          aria-label="급여 종류"
          value={care}
          onChange={(event) => setCare(event.target.value as CareFilter)}
        >
          <option value="all">급여 종류 · 전체</option>
          <option value="facility">급여 종류 · 시설</option>
          <option value="home">급여 종류 · 재가</option>
        </select>
      </div>

      <section className="panel">
        {rows.some(wasResent) && (
          <p className="table-legend">
            <Icon name="refresh" /> 재전송: 되돌린 뒤 {names.workerSubject} 고쳐서 다시 전송했어요.
          </p>
        )}
        {rows.length === 0 ? (
          <p className="empty" style={{ padding: 32, textAlign: "center" }}>
            검토할 기록이 없어요.
          </p>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>어르신</th>
                <th>급여</th>
                <th>{names.worker}</th>
                <th>방문·돌봄 시간</th>
                <th>확인 필요</th>
                <th>받은 시각</th>
                <th aria-label="열기" />
              </tr>
            </thead>
            <tbody>
              {rows.map((record) => {
                const resident = getResident(db, record.residentId);
                const unresolved = countUnresolved(record.items);
                const late = lateDays(record) ?? 0;
                const visit =
                  resident?.careType === "home" ? ` ${timeRangeLabel(resident.visitTime)}` : "";
                return (
                  <tr
                    key={record.id}
                    className="link"
                    tabIndex={0}
                    onClick={() => router.push(`/review/${record.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(`/review/${record.id}`);
                    }}
                  >
                    <td>
                      <b>{resident?.name.replace(" 어르신", "")}</b>
                      {wasResent(record) && (
                        <span className="resent" role="img" aria-label="재전송" title="재전송">
                          <Icon name="refresh" />
                        </span>
                      )}
                    </td>
                    <td>{resident?.careType === "home" ? "재가" : "시설"}</td>
                    <td>{record.workerName ?? db.worker.name}</td>
                    <td>
                      {monthDayWeek(record.careDate)}
                      {visit}
                    </td>
                    <td>
                      {unresolved > 0 ? (
                        <span className="chip warn">{unresolved}개</span>
                      ) : (
                        <span className="muted">0개</span>
                      )}{" "}
                      {late > 0 && <span className="chip blue">지연전송 · {late}일 뒤</span>}
                    </td>
                    <td>{receivedLabel(record.submittedAt, today)}</td>
                    <td>
                      <Icon name="next" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
