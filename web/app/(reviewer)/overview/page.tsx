"use client";

// M0(기록 현황): 기존 M1의 누락·기한 지난 기록 처리를 서랍으로 이동(#148).
// 재전송 기록(되돌린 뒤 다시 전송한 기록)은 어르신 이름 옆에 ↻ 아이콘(10/28 알림표시 결정).
// 그 아래 8~30일 전 빈 날은 ‘기한 지난 빈 기록’ 상자, 관리자가 기록 없음으로 정리(기한지난빈기록 결정).
import { ResidentPhoto } from "@/components/resident-photo";

import { useEffect, useState } from "react";
import Link from "next/link";

import { overviewCounts, elapsedReturnDays } from "@/lib/demo/overview";
import "./overview.css";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { DeskModal, DeskShell, useToast } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import { TextArea } from "@/components/mobile/text-field";
import { markOverdueNoCare, removeNoCareDay } from "@/lib/demo/review";
import {
  addDays,
  getResident,
  listMissed,
  listOverdue,
  monthDayWeek,
  type NoCareDay,
  type NoCareReason,
  noCareReasonLabel,
  OVERDUE_FROM,
  OVERDUE_TO,
  residentWorkerNames,
  returnedRecords,
} from "@/lib/demo/store";

export default function OverviewPage() {
  return (
    <DeskShell active="overview">
      <Overview />
    </DeskShell>
  );
}

function Overview() {
  const demo = useDemo()!;
  const { db, today } = demo;
  const toast = useToast();
  const names = useRoleNames();
  // 작성자 걸러 보기: 실제 모드는 기관 작성자 전부(list_org_staff), Mock은 한 명(이슈 #95)
  const workerNames = db.staff
    ? db.staff.filter((person) => person.role === "worker").map((person) => person.name)
    : [db.worker.name];
  const [drawer, setDrawer] = useState<"returned" | "missed" | "overdue" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const counts = overviewCounts(db, today, now);
  const returned = returnedRecords(db);
  const [marking, setMarking] = useState<{ residentId: string; careDate: string } | null>(null);
  // [처리 지우기]는 한 번 더 묻고, 요청 중에는 다시 누를 수 없다(이슈 #136)
  const [clearing, setClearing] = useState<{
    residentId: string;
    careDate: string;
    /** 지운 뒤 안내 문구 */
    done: string;
  } | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const clearNoCare = () => {
    if (!clearing || clearBusy) return;
    const { residentId, careDate, done } = clearing;
    if (demo.real) {
      setClearBusy(true);
      void demo.real.actions.removeNoCare(residentId, careDate).then((result) => {
        setClearBusy(false);
        setClearing(null);
        toast.show(result.ok ? done : result.ko);
      });
      return;
    }
    demo.update((current) => removeNoCareDay(current, residentId, careDate));
    setClearing(null);
    toast.show(done);
  };

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
      workerId: undefined as string | undefined,
      workerName: undefined as string | undefined,
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
          <h1>기록 현황</h1>
          <p>{monthDayWeek(today)} 기준</p>
        </div>
      </header>
      <div className="overview-grid">
        <Link href="/review" className="overview-tile overview-primary">
          <span>검토 대기</span>
          <strong>{counts.waiting}건</strong>
          <div className="overview-chips">
            {counts.resent > 0 && <span>재전송 {counts.resent}</span>}
            {counts.late > 0 && <span>지연전송 {counts.late}</span>}
            {counts.noUnresolved > 0 && <span>확인 필요 0 · {counts.noUnresolved}건</span>}
          </div>
        </Link>
        <button type="button" className="overview-tile" onClick={() => setDrawer("returned")}>
          <span>수정 요청 중</span>
          <strong>{counts.returned}건</strong>
          <small>요청한 지 2일 넘음 {counts.returnedOver48h}건</small>
        </button>
        <button type="button" className="overview-tile" onClick={() => setDrawer("missed")}>
          <span>작성 전</span>
          <strong>{counts.missed}건</strong>
        </button>
        <button type="button" className="overview-tile" onClick={() => setDrawer("overdue")}>
          <span>기한 지난 빈 기록</span>
          <strong>{counts.overdue}건</strong>
        </button>
      </div>
      <DeskModal
        open={drawer !== null}
        drawer
        onClose={() => setDrawer(null)}
        label={
          drawer === "returned"
            ? "수정 요청 중"
            : drawer === "missed"
              ? "작성 전 기록 · 지난 7일"
              : "기한 지난 빈 기록 · 8~30일 전"
        }
      >
        <div className="overview-drawer">
          <header className="overview-drawer-head">
            <h2>
              {drawer === "returned"
                ? "수정 요청 중"
                : drawer === "missed"
                  ? "작성 전 기록 · 지난 7일"
                  : "기한 지난 빈 기록 · 8~30일 전"}
            </h2>
            <button type="button" className="dbtn" onClick={() => setDrawer(null)}>
              닫기
            </button>
          </header>
          {drawer === "returned" &&
            (returned.length === 0 ? (
              <p>수정 요청 중인 기록이 없어요.</p>
            ) : (
              <ul className="overview-returned">
                {returned.map((record) => (
                  <li key={record.id}>
                    <b>{getResident(db, record.residentId)?.name}</b>
                    <span>
                      {monthDayWeek(record.careDate)} · {record.workerName ?? db.worker.name}
                    </span>
                    <span>수정 요청 사유: {record.returnReason || "사유 없음"}</span>
                    <small>
                      {record.returnedAt
                        ? `요청한 지 ${elapsedReturnDays(record.returnedAt, now)}일`
                        : "요청 시각 없음"}
                    </small>
                  </li>
                ))}
              </ul>
            ))}
          {drawer === "missed" && (
            <section className="missed-box" aria-label="작성 전 기록">
              <button type="button" aria-expanded={true} disabled>
                지난 7일 작성 전 기록 {missed.length}건 · 기록 없음 처리 {noCare.length}건
                <span>
                  목록 <Icon name="down" />
                </span>
              </button>
              {true && (
                <ul className="missed-list">
                  {boxRows.map((row) => {
                    const resident = getResident(db, row.residentId);
                    return (
                      <li
                        key={`${row.residentId}-${row.careDate}-${row.kind}-${row.workerId ?? ""}`}
                      >
                        <span>{monthDayWeek(row.careDate)}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          {resident && <ResidentPhoto resident={resident} size={36} />}
                          <b>{resident?.name}</b>
                        </span>
                        {/* 못 쓴 기록은 작성자마다 한 줄. 기록 없음 처리는 어르신 단위라 담당 작성자들을 보인다(이슈 #95) */}
                        <span>
                          {row.workerName ?? residentWorkerNames(db, row.residentId).join(", ")}
                        </span>
                        {row.noCare ? (
                          <>
                            <b>{noCareText(row.noCare)}</b>
                            <button
                              type="button"
                              className="dbtn sm soft"
                              onClick={() =>
                                setClearing({
                                  residentId: row.residentId,
                                  careDate: row.careDate,
                                  done: `기록 없음 처리를 지웠어요. ${names.worker} 기록 ‘작성 전’에 다시 보여요.`,
                                })
                              }
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

          {drawer === "overdue" && (
            <section className="missed-box overdue" aria-label="기한 지난 빈 기록">
              <button type="button" aria-expanded={true} disabled>
                기한 지난 빈 기록 {overdue.length}건 · 정리 {overdueDone.length}건 ({OVERDUE_FROM}~
                {OVERDUE_TO}일 전)
                <span>
                  목록 <Icon name="down" />
                </span>
              </button>
              {true && (
                <>
                  <p className="missed-note">
                    7일이 지나 {names.workerSubject} 더는 쓸 수 없는 날이에요. {names.worker}에게
                    사정을 묻고 사유를 남겨 주세요.
                  </p>
                  <ul className="missed-list">
                    {overdueRows.map((row) => {
                      const resident = getResident(db, row.residentId);
                      return (
                        <li key={`${row.residentId}-${row.careDate}`}>
                          <span>{monthDayWeek(row.careDate)}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            {resident && <ResidentPhoto resident={resident} size={36} />}
                            <b>{resident?.name}</b>
                          </span>
                          <span>{residentWorkerNames(db, row.residentId).join(", ")}</span>
                          {row.noCare ? (
                            <>
                              <b>
                                {noCareText(row.noCare)}
                                {!workerNames.includes(row.noCare.createdBy) &&
                                  ` · ${row.noCare.createdBy} 정리`}
                              </b>
                              <button
                                type="button"
                                className="dbtn sm soft"
                                onClick={() =>
                                  setClearing({
                                    residentId: row.residentId,
                                    careDate: row.careDate,
                                    done: "기록 없음 처리를 지웠어요. 다시 기한 지난 빈 기록으로 보여요.",
                                  })
                                }
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

          {drawer === "missed" && boxRows.length === 0 && <p>작성 전 기록이 없어요.</p>}
          {drawer === "overdue" && overdueRows.length === 0 && <p>기한 지난 빈 기록이 없어요.</p>}
        </div>
      </DeskModal>
      {clearing && (
        <DeskModal
          open
          onClose={() => !clearBusy && setClearing(null)}
          label="기록 없음 처리를 지울까요?"
        >
          <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>‘기록 없음’ 정리를 지울까요?</h2>
          <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>
            {getResident(db, clearing.residentId)?.name ?? ""} · {monthDayWeek(clearing.careDate)}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="dbtn"
              disabled={clearBusy}
              onClick={() => setClearing(null)}
            >
              취소
            </button>
            <button
              type="button"
              className="dbtn danger"
              disabled={clearBusy}
              onClick={clearNoCare}
            >
              {clearBusy ? "지우는 중" : "지우기"}
            </button>
          </div>
        </DeskModal>
      )}
      {marking && (
        <OverdueModal
          label={`${getResident(db, marking.residentId)?.name ?? ""} · ${monthDayWeek(marking.careDate)}`}
          onClose={() => setMarking(null)}
          onSave={(reason, note) => {
            const next = markOverdueNoCare(db, { ...marking, reason, note }, today);
            if ("error" in next) return false;
            setMarking(null);
            if (demo.real) {
              // 관리자가 no_care_days에 바로 넣는다(8~30일 전, 범위 밖은 DB가 거절).
              // 결과가 온 뒤에 성공·실패를 알린다(이슈 #114: 실패해도 '정리했어요'가 먼저 뜨던 문제)
              void demo.real.actions
                .addNoCare({ ...marking, reason, note })
                .then((result) => toast.show(result.ok ? "기록 없음으로 정리했어요." : result.ko));
              return true;
            }
            demo.update(() => next);
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
  // 교육용 기관이면 교육생·강사(이슈 #146)
  const names = useRoleNames();
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
      <TextArea
        id="overdue-note"
        className={`field ${error ? "invalid" : ""}`}
        rows={3}
        maxLength={100}
        value={note}
        onValueChange={(next) => {
          setNote(next);
          setError(false);
        }}
        placeholder={`예: ${names.worker}에게 확인함. 이날 병원 진료로 외출.`}
      />
      {error && (
        <p className="fhint">
          <span className="warn-text">기타는 사유를 써 주세요.</span>
        </p>
      )}
      <p className="info-note">
        정리한 사람은 {names.reviewer} 이름으로 남고, 잘못 정리했으면 지울 수 있어요.
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
