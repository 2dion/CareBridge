"use client";

// R1(검토 대기): 확인 필요가 많은 기록부터. 위에 지난 7일 작성 전 기록·기록 없음 처리.
// 되돌린 뒤 다시 전송한 기록은 어르신 이름 옆에 ↻ 아이콘(10/28 알림표시 결정).
// 그 아래 8~30일 전 빈 날은 ‘기한 지난 빈 기록’ 상자, 관리자가 기록 없음으로 정리(기한지난빈기록 결정).
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { DeskModal, DeskShell, receivedLabel, useToast } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import { markOverdueNoCare, removeNoCareDay, reviewQueue, wasResent } from "@/lib/demo/review";
import { countUnresolved } from "@/lib/demo/state";
import {
  addDays,
  getResident,
  lateDays,
  listMissed,
  listOverdue,
  monthDayWeek,
  type NoCareDay,
  type NoCareReason,
  noCareReasonLabel,
  OVERDUE_FROM,
  OVERDUE_TO,
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
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [marking, setMarking] = useState<{ residentId: string; careDate: string } | null>(null);

  const from = dates === "today" ? today : dates === "7" ? addDays(today, -7) : "0000-00-00";
  const rows = reviewQueue(db).filter((record) => {
    const resident = getResident(db, record.residentId);
    if (care !== "all" && resident?.careType !== care) return false;
    if (worker !== "all" && worker !== (record.workerName ?? db.worker.name)) return false;
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

  const overdue = listOverdue(db, today);
  const overdueDone = db.noCareDays.filter(
    (day) =>
      day.careDate >= addDays(today, -OVERDUE_TO) && day.careDate <= addDays(today, -OVERDUE_FROM),
  );
  const overdueRows = [
    ...overdue.map((row) => ({ ...row, noCare: null as NoCareDay | null })),
    ...overdueDone.map((day) => ({
      residentId: day.residentId,
      careDate: day.careDate,
      noCare: day,
    })),
  ].sort((a, b) => (a.careDate < b.careDate ? 1 : -1));
  const noCareText = (day: NoCareDay) =>
    `기록 없음 · ${noCareReasonLabel[day.reason].ko.replace(" (직접 쓰기)", "")}${
      day.note ? ` (${day.note})` : ""
    }`;

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
        <section className="missed-box" aria-label="작성 전 기록">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
            지난 7일 작성 전 기록 {missed.length}건 · 기록 없음 처리 {noCare.length}건
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
                        <b>{noCareText(row.noCare)}</b>
                        <button
                          type="button"
                          className="dbtn sm soft"
                          onClick={() => {
                            if (demo.real) {
                              void demo.real.actions.removeNoCare(row.residentId, row.careDate);
                            } else {
                              demo.update((current) =>
                                removeNoCareDay(current, row.residentId, row.careDate),
                              );
                            }
                            toast.show(
                              "기록 없음 처리를 지웠어요. 작성자 기록 ‘작성 전’에 다시 보여요.",
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

      {overdueRows.length > 0 && (
        <section className="missed-box overdue" aria-label="기한 지난 빈 기록">
          <button
            type="button"
            onClick={() => setOverdueOpen(!overdueOpen)}
            aria-expanded={overdueOpen}
          >
            기한 지난 빈 기록 {overdue.length}건 · 정리 {overdueDone.length}건 ({OVERDUE_FROM}~
            {OVERDUE_TO}일 전)
            <span>
              {overdueOpen ? "접기" : "펼치기"} <Icon name="down" />
            </span>
          </button>
          {overdueOpen && (
            <>
              <p className="missed-note">
                7일이 지나 작성자가 더는 쓸 수 없는 날이에요. 작성자에게 사정을 묻고 사유를 남겨
                주세요.
              </p>
              <ul className="missed-list">
                {overdueRows.map((row) => {
                  const resident = getResident(db, row.residentId);
                  return (
                    <li key={`${row.residentId}-${row.careDate}`}>
                      <span>{monthDayWeek(row.careDate)}</span>
                      <b>{resident?.alias}</b>
                      <span>{db.worker.name}</span>
                      {row.noCare ? (
                        <>
                          <b>
                            {noCareText(row.noCare)}
                            {row.noCare.createdBy !== db.worker.name &&
                              ` · ${row.noCare.createdBy} 정리`}
                          </b>
                          <button
                            type="button"
                            className="dbtn sm soft"
                            onClick={() => {
                              if (demo.real) {
                                void demo.real.actions.removeNoCare(row.residentId, row.careDate);
                              } else {
                                demo.update((current) =>
                                  removeNoCareDay(current, row.residentId, row.careDate),
                                );
                              }
                              toast.show(
                                "기록 없음 처리를 지웠어요. 다시 기한 지난 빈 기록으로 보여요.",
                              );
                            }}
                          >
                            처리 지우기
                          </button>
                        </>
                      ) : (
                        <>
                          <b className="overdue-text">빈 날 · 기한 지남</b>
                          <button
                            type="button"
                            className="dbtn sm"
                            onClick={() =>
                              setMarking({ residentId: row.residentId, careDate: row.careDate })
                            }
                          >
                            기록 없음으로 정리
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="panel">
        {rows.some(wasResent) && (
          <p className="table-legend">
            <Icon name="refresh" /> 다시 전송한 기록: 되돌린 뒤 작성자가 고쳐서 다시 전송했어요.
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
                      {wasResent(record) && (
                        <span
                          className="resent"
                          role="img"
                          aria-label="다시 전송한 기록"
                          title="다시 전송한 기록"
                        >
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
                      {late > 0 && <span className="chip blue">늦게 전송 · {late}일 뒤</span>}
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
      {marking && (
        <OverdueModal
          label={`${getResident(db, marking.residentId)?.alias ?? ""} · ${monthDayWeek(marking.careDate)}`}
          onClose={() => setMarking(null)}
          onSave={(reason, note) => {
            const next = markOverdueNoCare(db, { ...marking, reason, note }, today);
            if ("error" in next) return false;
            if (demo.real) {
              // 관리자가 no_care_days에 바로 넣는다(8~30일 전, 범위 밖은 DB가 거절)
              void demo.real.actions
                .addNoCare({ ...marking, reason, note })
                .then((result) => !result.ok && toast.show(result.ko));
            } else {
              demo.update(() => next);
            }
            setMarking(null);
            toast.show("기록 없음으로 정리했어요.");
            return true;
          }}
        />
      )}
      {toast.node}
    </>
  );
}

const REASONS: NoCareReason[] = ["hospital", "overnight", "visit_cancelled", "other"];

/** [기록 없음으로 정리] 창: 작성자 [이 날 기록 없음]과 같은 사유 4가지, 기타는 메모 필수. */
function OverdueModal({
  label,
  onClose,
  onSave,
}: {
  label: string;
  onClose: () => void;
  onSave: (reason: NoCareReason, note: string) => boolean;
}) {
  const [reason, setReason] = useState<NoCareReason>("hospital");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  return (
    <DeskModal open onClose={onClose} label="기록 없음으로 정리">
      <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>기록 없음으로 정리</h2>
      <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>
        {label}
      </p>
      <p className="flabel">돌봄이 없던 사유</p>
      <div className="chips" style={{ marginBottom: 14 }}>
        {REASONS.map((key) => (
          <button
            key={key}
            type="button"
            className={reason === key ? "on" : ""}
            aria-pressed={reason === key}
            onClick={() => {
              setReason(key);
              setError(false);
            }}
          >
            {noCareReasonLabel[key].ko.replace(" (직접 쓰기)", "")}
          </button>
        ))}
      </div>
      <label className="flabel" htmlFor="overdue-note">
        메모 {reason === "other" ? "(꼭 쓰기)" : "(선택)"}
      </label>
      <textarea
        id="overdue-note"
        className={`field ${error ? "invalid" : ""}`}
        rows={3}
        maxLength={100}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setError(false);
        }}
        placeholder="예: 작성자에게 확인함. 이날 병원 진료로 외출."
      />
      {error && (
        <p className="fhint">
          <span className="warn-text">기타는 사유를 써 주세요.</span>
        </p>
      )}
      <p className="info-note">
        정리한 사람은 관리자 이름으로 남고, 잘못 정리했으면 지울 수 있어요.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="dbtn" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="dbtn primary"
          onClick={() => {
            if (reason === "other" && !note.trim()) {
              setError(true);
              return;
            }
            if (!onSave(reason, note.trim())) setError(true);
          }}
        >
          정리하기
        </button>
      </div>
    </DeskModal>
  );
}
