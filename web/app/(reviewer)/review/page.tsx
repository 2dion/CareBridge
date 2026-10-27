"use client";

// R1(검토 대기, 피그마 D00): 확인 필요가 많은 기록부터. 위에 지난 7일 못 쓴 기록·기록 없음 처리.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { DeskShell, receivedLabel, useToast } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import { removeNoCareDay, reviewQueue } from "@/lib/demo/review";
import { countUnresolved } from "@/lib/demo/state";
import {
  addDays,
  getResident,
  lateDays,
  listMissed,
  monthDayWeek,
  noCareReasonLabel,
  timeRangeLabel,
} from "@/lib/demo/store";

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
  const toast = useToast();
  const [worker, setWorker] = useState("all");
  const [dates, setDates] = useState<DateFilter>("7");
  const [care, setCare] = useState<CareFilter>("all");
  const [open, setOpen] = useState(true);

  const from = dates === "today" ? today : dates === "7" ? addDays(today, -7) : "0000-00-00";
  const rows = reviewQueue(db).filter((record) => {
    const resident = getResident(db, record.residentId);
    if (care !== "all" && resident?.careType !== care) return false;
    if (worker !== "all" && worker !== db.worker.name) return false;
    return record.careDate >= from;
  });

  const weekAgo = addDays(today, -7);
  const missed = listMissed(db, today);
  const noCare = db.noCareDays
    .filter((day) => day.careDate >= weekAgo)
    .sort((a, b) => (a.careDate < b.careDate ? 1 : -1));
  const boxRows = [
    ...missed.map((row) => ({ ...row, noCare: null })),
    ...noCare.map((day) => ({
      residentId: day.residentId,
      careDate: day.careDate,
      kind: "no_care" as const,
      noCare: day,
    })),
  ].sort((a, b) => (a.careDate < b.careDate ? 1 : -1));

  return (
    <>
      <header className="page-head">
        <div>
          <h1>검토 대기</h1>
          <p>확인 필요가 많은 기록부터 보여 줘요.</p>
        </div>
      </header>
      <div className="filters">
        <select
          className="select"
          aria-label="작성자"
          value={worker}
          onChange={(event) => setWorker(event.target.value)}
        >
          <option value="all">작성자 · 전체</option>
          <option value={db.worker.name}>작성자 · {db.worker.name}</option>
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

      {boxRows.length > 0 && (
        <section className="missed-box" aria-label="못 쓴 기록">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
            지난 7일 못 쓴 기록 {missed.length}건 · 기록 없음 처리 {noCare.length}건
            <span>
              {open ? "접기" : "펼치기"} <Icon name="down" />
            </span>
          </button>
          {open && (
            <ul className="missed-list">
              {boxRows.map((row) => {
                const resident = getResident(db, row.residentId);
                return (
                  <li key={`${row.residentId}-${row.careDate}-${row.kind}`}>
                    <span>{monthDayWeek(row.careDate)}</span>
                    <b>{resident?.alias}</b>
                    <span>{db.worker.name}</span>
                    {row.noCare ? (
                      <>
                        <b>
                          기록 없음 ·{" "}
                          {noCareReasonLabel[row.noCare.reason].ko.replace(" (직접 쓰기)", "")}
                          {row.noCare.note ? ` (${row.noCare.note})` : ""}
                        </b>
                        <button
                          type="button"
                          className="dbtn sm soft"
                          onClick={() => {
                            demo.update((current) =>
                              removeNoCareDay(current, row.residentId, row.careDate),
                            );
                            toast.show(
                              "기록 없음 처리를 지웠어요. 작성자 못 쓴 기록에 다시 보여요.",
                            );
                          }}
                        >
                          처리 지우기
                        </button>
                      </>
                    ) : (
                      <span className="muted">
                        {row.kind === "draft" ? "임시 저장" : "작성 전"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="panel">
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
                <th>작성자</th>
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
                      <b>{resident?.alias.replace(" 어르신", "")}</b>
                    </td>
                    <td>{resident?.careType === "home" ? "재가" : "시설"}</td>
                    <td>{db.worker.name}</td>
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
                      {late > 0 && <span className="chip blue">늦게 보냄 · {late}일 뒤</span>}
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
      {toast.node}
    </>
  );
}
