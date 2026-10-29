"use client";

// M4(어르신·작성자): 어르신 목록·추가, 작성자 목록, 담당 연결(작성자·담당 시작일·방문 요일·방문 시간).
// 방문 요일은 1=월 … 7=일(assignments.visit_days). 담당 시작일부터 못 쓴 기록을 센다(데이터구조 v1.6.4).
// 실제 모드는 기관 작성자 목록(list_org_staff)에서 여럿을 고르고, 담당 연결은 어르신·작성자 한 쌍마다 한 줄로 저장한다(이슈 #95).
// 방문 시간은 표시용 assignments.schedule에 저장한다.
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { DeskModal, DeskShell, useToast } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import {
  addResident,
  type ResidentEdit,
  residentEditChanged,
  residentHasRecords,
  updateResident,
} from "@/lib/demo/review";
import {
  addDays,
  monthDay,
  type Resident,
  residentWorkerNames,
  type StaffMember,
  workerRecords,
} from "@/lib/demo/store";

const dayNames = ["월", "화", "수", "목", "금", "토", "일"];
/** Mock 모드의 작성자 한 명(실제 모드는 list_org_staff) */
const MOCK_WORKER_ID = "mock-worker";
/** 작성자 모국어 표시(화면 설계 v1.3 M4 "작성자: 이름, 모국어", 결정 2026-10-30-명단모국어) */
const LANG_LABEL: Record<StaffMember["nativeLang"], string> = { ko: "한국어", vi: "베트남어" };

function VisitDays({ days }: { days: number[] | null }) {
  if (days === null) return <span className="muted">매일 (시설)</span>;
  return (
    <span
      className="days"
      aria-label={`방문 요일 ${days.map((d) => dayNames[d - 1]).join(", ") || "없음"}`}
    >
      {dayNames.map((name, index) => (
        <span key={name} className={days.includes(index + 1) ? "on" : ""}>
          {name}
        </span>
      ))}
    </span>
  );
}

export default function ResidentsPage() {
  return (
    <DeskShell active="residents">
      <Residents />
    </DeskShell>
  );
}

function Residents() {
  const router = useRouter();
  const params = useSearchParams();
  const demo = useDemo()!;
  const { db, today } = demo;
  const toast = useToast();
  const names = useRoleNames();
  const tab = params.get("tab") === "workers" ? "workers" : "residents";
  const [editing, setEditing] = useState<Resident | null>(null);
  const [adding, setAdding] = useState(false);
  const noDays = db.residents.some((resident) => resident.visitDays?.length === 0);
  const weekStart = addDays(today, -6);
  // 작성자 목록: 실제 모드는 기관 직원(worker), Mock은 한 명
  const workers: StaffMember[] = db.staff
    ? db.staff.filter((person) => person.role === "worker")
    : [{ id: MOCK_WORKER_ID, name: db.worker.name, role: "worker", nativeLang: "vi" }];
  const workerIdsOf = (residentId: string) =>
    db.assignments
      ? db.assignments.filter((link) => link.residentId === residentId).map((link) => link.workerId)
      : workers.map((worker) => worker.id);
  const weekCount = (worker: StaffMember) =>
    workerRecords(db).filter(
      (record) =>
        record.careDate >= weekStart &&
        record.status !== "draft" &&
        (!db.staff || record.workerName === worker.name),
    ).length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>어르신·{names.worker}</h1>
          <p>어르신을 추가하고 담당 {names.worker}를 연결해요.</p>
        </div>
        {tab === "residents" && (
          <div className="actions">
            <button type="button" className="dbtn primary" onClick={() => setAdding(true)}>
              + 어르신 추가
            </button>
          </div>
        )}
      </header>
      <div className="seg" role="tablist" style={{ marginBottom: 16 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "residents"}
          className={tab === "residents" ? "on" : ""}
          onClick={() => router.replace("/residents")}
        >
          어르신 {db.residents.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "workers"}
          className={tab === "workers" ? "on" : ""}
          onClick={() => router.replace("/residents?tab=workers")}
        >
          {names.worker} {workers.length}
        </button>
      </div>

      {tab === "residents" ? (
        <section className="panel">
          <table className="dtable">
            <thead>
              <tr>
                <th>가명</th>
                <th>급여</th>
                <th>담당 {names.worker}</th>
                <th>담당 시작일</th>
                <th>방문 요일</th>
                <th>방문 시간</th>
                <th aria-label="수정" />
              </tr>
            </thead>
            <tbody>
              {db.residents.map((resident) => {
                const assigned = residentWorkerNames(db, resident.id);
                return (
                  <tr key={resident.id}>
                    <td>
                      <b>{resident.alias.replace(" 어르신", "")}</b>
                    </td>
                    <td>{resident.careType === "home" ? "재가" : "시설"}</td>
                    <td>
                      {assigned.length > 0 ? (
                        assigned.join(", ")
                      ) : (
                        <span className="warn-text">없음</span>
                      )}
                    </td>
                    <td>{monthDay(resident.startDate)}</td>
                    <td>
                      <VisitDays days={resident.visitDays} />
                    </td>
                    <td>
                      {resident.careType === "home"
                        ? (resident.visitTime?.replace("~", "–") ?? "—")
                        : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dbtn sm"
                        onClick={() => setEditing(resident)}
                      >
                        <Icon name="pencil" />
                        수정
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {noDays && (
            <p className="warn-row">
              <Icon name="alert" />
              방문 요일을 정해야 작성 전 기록을 알려 줄 수 있어요.
            </p>
          )}
        </section>
      ) : (
        <section className="panel">
          <table className="dtable">
            <thead>
              <tr>
                <th>이름</th>
                <th>모국어</th>
                <th>담당 어르신</th>
                <th>담당 시작일</th>
                <th>이번 주 기록</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => {
                const mine = db.residents.filter((resident) =>
                  workerIdsOf(resident.id).includes(worker.id),
                );
                const since = db.assignments
                  ? db.assignments
                      .filter((link) => link.workerId === worker.id)
                      .map((link) => link.startDate)
                      .sort()[0]
                  : db.residents[0]?.startDate;
                return (
                  <tr key={worker.id}>
                    <td>
                      <b>{worker.name}</b>
                    </td>
                    <td>{LANG_LABEL[worker.nativeLang]}</td>
                    <td>
                      {mine.map((resident) => resident.alias.replace(" 어르신", "")).join(", ") || (
                        <span className="muted">없음</span>
                      )}
                    </td>
                    <td>{since ? monthDay(since) : "—"}</td>
                    <td>{weekCount(worker)}건</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="info-note" style={{ margin: 16 }}>
            {names.worker}는 설정의 가입 코드로 직접 가입해요. 담당 연결은 어르신 탭의 [수정]에서
            바꿔요.
            {!db.staff && " 시연(Mock)에는 작성자가 한 명이에요."}
          </p>
        </section>
      )}

      {editing && (
        <AssignDrawer
          key={editing.id}
          resident={editing}
          today={today}
          workers={workers}
          selectedWorkerIds={workerIdsOf(editing.id)}
          workerLabel={names.worker}
          onClose={() => setEditing(null)}
          lockCareType={residentHasRecords(db, editing.id)}
          onSave={(edit) => {
            // 바뀐 게 없으면 저장하지 않고 '저장했어요'도 띄우지 않는다(이슈 #96)
            const currentIds = db.assignments ? workerIdsOf(editing.id) : null;
            if (!residentEditChanged(editing, currentIds, edit)) {
              setEditing(null);
              toast.show("바뀐 내용이 없어요.");
              return null;
            }
            if (demo.real) {
              if (
                edit.alias !== undefined &&
                db.residents.some(
                  (resident) => resident.id !== editing.id && resident.alias === edit.alias,
                )
              ) {
                return "duplicate";
              }
              setEditing(null);
              // residents(가명·급여 종류)는 바뀐 때만, 담당 연결은 고른 작성자만 남기고(빠진 줄 지움, 새 줄 넣음)
              // 방문 요일·시작일·표시용 방문 시간(schedule)을 저장한다
              void demo.real.actions.updateResident(editing.id, edit).then((result) => {
                toast.show(
                  result.ok
                    ? result.changed
                      ? "저장했어요."
                      : "바뀐 내용이 없어요. 화면을 새로 고쳐 주세요."
                    : result.ko,
                );
              });
              return null;
            }
            const next = updateResident(db, editing.id, edit);
            if ("error" in next) return next.error;
            setEditing(null);
            demo.update(() => next);
            toast.show("저장했어요.");
            return null;
          }}
        />
      )}
      <AddResidentModal
        open={adding}
        today={today}
        workers={workers}
        workerLabel={names.worker}
        onClose={() => setAdding(false)}
        onAdd={(input) => {
          const next = addResident(db, input);
          if ("error" in next) return next.error;
          if (demo.real) {
            // residents에 바로 넣고(가명만, 원칙 9) 고른 작성자와 담당 연결을 만든다(이슈 #95)
            void demo.real.actions
              .addResident(`${input.initial.trim().slice(0, 1)}○○ 어르신`, input.careType, {
                workerIds: input.workerIds,
                startDate: input.startDate,
              })
              .then((result) =>
                toast.show(
                  result.ok
                    ? input.careType === "home"
                      ? "어르신을 추가했어요. [수정]에서 방문 요일을 정해 주세요."
                      : "어르신을 추가했어요."
                    : result.ko,
                ),
              );
            setAdding(false);
            return null;
          }
          demo.update(() => next);
          setAdding(false);
          toast.show("어르신을 추가했어요. 담당 연결에서 방문 요일을 정해 주세요.");
          return null;
        }}
      />
      {toast.node}
    </>
  );
}

const EDIT_ERRORS: Record<"duplicate" | "care_type_locked", string> = {
  duplicate: "같은 가명이 이미 있어요. 다른 글자를 써 주세요.",
  care_type_locked: "기록이 있는 어르신은 급여 종류를 바꿀 수 없어요.",
};

function WorkerPicker({
  workers,
  selected,
  label,
  onToggle,
}: {
  workers: StaffMember[];
  selected: string[];
  label: string;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="stack" role="group" aria-label={`담당 ${label}`} style={{ gap: 6 }}>
      {workers.length === 0 && <p className="muted">가입한 {label}가 없어요.</p>}
      {workers.map((worker) => (
        <label key={worker.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={selected.includes(worker.id)}
            onChange={() => onToggle(worker.id)}
          />
          {worker.name}
          <span className="muted">· {LANG_LABEL[worker.nativeLang]}</span>
        </label>
      ))}
    </div>
  );
}

/** M4 [수정] 서랍: 어르신 정보(가명·급여 종류, 이슈 #96)와 담당 연결(작성자·시작일·방문 요일·표시용 방문 시간) */
function AssignDrawer({
  resident,
  today,
  workers,
  selectedWorkerIds,
  workerLabel,
  lockCareType,
  onClose,
  onSave,
}: {
  resident: Resident;
  today: string;
  workers: StaffMember[];
  selectedWorkerIds: string[];
  workerLabel: string;
  /** 기록이 하나라도 있으면 급여 종류(서식)를 바꿀 수 없다 */
  lockCareType: boolean;
  onClose: () => void;
  /** 저장. 막히면 오류 키를 돌려준다 */
  onSave: (edit: ResidentEdit) => "duplicate" | "care_type_locked" | null;
}) {
  const [initial, setInitial] = useState(resident.initial);
  const [careType, setCareType] = useState<Resident["careType"]>(resident.careType);
  const home = careType === "home";
  const [workerIds, setWorkerIds] = useState<string[]>(selectedWorkerIds);
  const [days, setDays] = useState<number[]>(resident.visitDays ?? []);
  const [startDate, setStartDate] = useState(resident.startDate);
  const [from, setFrom] = useState(resident.visitTime?.split("~")[0] ?? "");
  const [to, setTo] = useState(resident.visitTime?.split("~")[1] ?? "");
  const [error, setError] = useState<string | null>(null);
  const toggle = (day: number) =>
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  const toggleWorker = (id: string) =>
    setWorkerIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));

  const save = () => {
    const letter = initial.trim().slice(0, 1);
    if (!letter) return setError("성 한 글자를 써 주세요.");
    if (!startDate || startDate > today)
      return setError("담당 시작일은 오늘이나 그 전이어야 해요.");
    if (home && days.length === 0)
      return setError("재가 어르신은 방문 요일을 하나 이상 골라 주세요.");
    if ((from && !to) || (!from && to) || (from && to && from >= to))
      return setError("방문 시간은 시작이 끝보다 앞이어야 해요.");
    // 가명 규칙은 어르신 추가와 같다(성 한 글자 + ○○ 어르신). 같은 성 구분은 이슈 #99 결정을 기다린다
    const alias = `${letter}○○ 어르신`;
    const result = onSave({
      visitDays: home ? days : null,
      visitTime: home && from && to ? `${from}~${to}` : null,
      startDate,
      workerIds,
      ...(alias !== resident.alias ? { alias } : {}),
      ...(careType !== resident.careType ? { careType } : {}),
    });
    if (result) setError(EDIT_ERRORS[result]);
  };

  return (
    <DeskModal open onClose={onClose} label="어르신 수정" drawer>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>어르신 수정</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {resident.alias} ·{" "}
            {resident.careType === "home" ? "재가 (별지 제12호)" : "시설 (별지 제16호)"}
          </p>
        </div>
        <button type="button" className="text-link" onClick={onClose}>
          닫기
        </button>
      </div>
      <label className="flabel" htmlFor="edit-initial">
        가명 · 성 (한 글자)
      </label>
      <input
        id="edit-initial"
        className="field"
        maxLength={1}
        value={initial}
        onChange={(event) => {
          setInitial(event.target.value);
          setError(null);
        }}
      />
      <p className="fhint">화면에는 ‘{initial.trim().slice(0, 1) || "○"}○○ 어르신’으로 보여요.</p>
      <p className="flabel">급여 종류</p>
      <div className="seg" role="group" aria-label="급여 종류">
        <button
          type="button"
          className={careType === "facility" ? "on" : ""}
          disabled={lockCareType}
          onClick={() => setCareType("facility")}
        >
          시설 (별지 제16호)
        </button>
        <button
          type="button"
          className={careType === "home" ? "on" : ""}
          disabled={lockCareType}
          onClick={() => setCareType("home")}
        >
          재가 (별지 제12호)
        </button>
      </div>
      <p className="fhint">
        {lockCareType
          ? "기록이 있는 어르신은 급여 종류(서식)를 바꿀 수 없어요."
          : "급여 종류가 서식(별지 제16호 / 제12호)을 정해요."}
      </p>
      <p className="flabel">담당 {workerLabel}</p>
      <WorkerPicker
        workers={workers}
        selected={workerIds}
        label={workerLabel}
        onToggle={toggleWorker}
      />
      <p className="fhint">
        가입한 {workerLabel}만 고를 수 있어요. 고른 {workerLabel}마다 담당 연결 한 줄이 생겨요.
      </p>
      <label className="flabel" htmlFor="assign-start">
        담당 시작일
      </label>
      <input
        id="assign-start"
        className="field"
        type="date"
        max={today}
        value={startDate}
        onChange={(event) => setStartDate(event.target.value)}
      />
      <p className="fhint">이 날부터 작성 전 기록을 셉니다.</p>
      {home ? (
        <>
          <p className="flabel">방문 요일</p>
          <div className="days big" role="group" aria-label="방문 요일">
            {dayNames.map((name, index) => (
              <button
                key={name}
                type="button"
                className={days.includes(index + 1) ? "on" : ""}
                aria-pressed={days.includes(index + 1)}
                onClick={() => toggle(index + 1)}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="fhint">
            급여제공계획서의 횟수대로 고르세요.
            {days.length > 0 &&
              ` ${days.map((d) => dayNames[d - 1]).join("·")} = 주 ${days.length}회`}
          </p>
          <p className="flabel">방문 시간 (표시용)</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              className="field"
              type="time"
              aria-label="방문 시작"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            –
            <input
              className="field"
              type="time"
              aria-label="방문 끝"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </>
      ) : (
        <p className="info-note">시설 어르신은 매일 기록해요. 방문 요일이 없어요.</p>
      )}
      {error && (
        <p className="warn-text" role="alert">
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button type="button" className="dbtn" style={{ flex: 1 }} onClick={onClose}>
          취소
        </button>
        <button type="button" className="dbtn primary" style={{ flex: 1 }} onClick={save}>
          <Icon name="check" />
          저장
        </button>
      </div>
    </DeskModal>
  );
}

function AddResidentModal({
  open,
  today,
  workers,
  workerLabel,
  onClose,
  onAdd,
}: {
  open: boolean;
  today: string;
  workers: StaffMember[];
  workerLabel: string;
  onClose: () => void;
  onAdd: (input: {
    initial: string;
    careType: Resident["careType"];
    startDate: string;
    workerIds: string[];
  }) => "initial_required" | "duplicate" | null;
}) {
  const [initial, setInitial] = useState("");
  const [careType, setCareType] = useState<Resident["careType"]>("facility");
  // 작성자가 한 명이면 바로 고른 채로 둔다
  const [workerIds, setWorkerIds] = useState<string[]>(workers.length === 1 ? [workers[0].id] : []);
  const [error, setError] = useState<string | null>(null);
  const toggleWorker = (id: string) =>
    setWorkerIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));
  return (
    <DeskModal open={open} onClose={onClose} label="어르신 추가">
      <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>어르신 추가</h2>
      <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>
        실명 대신 성 한 글자만 써요. 화면에는 ‘김○○ 어르신’처럼 보여요.
      </p>
      <label className="flabel" htmlFor="add-initial">
        성 (한 글자)
      </label>
      <input
        id="add-initial"
        className="field"
        maxLength={1}
        value={initial}
        onChange={(event) => {
          setInitial(event.target.value);
          setError(null);
        }}
      />
      <p className="flabel" style={{ marginTop: 14 }}>
        급여 종류
      </p>
      <div className="seg">
        <button
          type="button"
          className={careType === "facility" ? "on" : ""}
          onClick={() => setCareType("facility")}
        >
          시설 (별지 제16호)
        </button>
        <button
          type="button"
          className={careType === "home" ? "on" : ""}
          onClick={() => setCareType("home")}
        >
          재가 (별지 제12호)
        </button>
      </div>
      <p className="flabel" style={{ marginTop: 14 }}>
        담당 {workerLabel} (담당 시작일은 오늘)
      </p>
      <WorkerPicker
        workers={workers}
        selected={workerIds}
        label={workerLabel}
        onToggle={toggleWorker}
      />
      {error && (
        <p className="warn-text" role="alert" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" className="dbtn" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="dbtn primary"
          onClick={() => {
            const result = onAdd({ initial, careType, startDate: today, workerIds });
            if (result === "initial_required") setError("성 한 글자를 써 주세요.");
            else if (result === "duplicate")
              setError("같은 가명이 이미 있어요. 다른 글자를 써 주세요.");
            else setInitial("");
          }}
        >
          추가
        </button>
      </div>
    </DeskModal>
  );
}
