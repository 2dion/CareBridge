"use client";

// R4(어르신·작성자, 피그마 D03·D11·D12): 어르신 목록·추가, 작성자 목록, 담당 연결(작성자·담당 시작일·방문 요일·방문 시간).
// 방문 요일은 1=월 … 7=일(assignments.visit_days). 담당 시작일부터 못 쓴 기록을 센다(데이터구조 v1.6.1).
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { DeskModal, DeskShell, useToast } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import { addResident, updateResident } from "@/lib/demo/review";
import { addDays, monthDay, type Resident, workerRecords } from "@/lib/demo/store";

const dayNames = ["월", "화", "수", "목", "금", "토", "일"];

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
  const tab = params.get("tab") === "workers" ? "workers" : "residents";
  const [editing, setEditing] = useState<Resident | null>(null);
  const [adding, setAdding] = useState(false);
  const noDays = db.residents.some((resident) => resident.visitDays?.length === 0);
  const weekStart = addDays(today, -6);
  const weekCount = workerRecords(db).filter(
    (record) => record.careDate >= weekStart && record.status !== "draft",
  ).length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>어르신·작성자</h1>
          <p>어르신을 추가하고 담당 작성자를 연결해요.</p>
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
          작성자 1
        </button>
      </div>

      {tab === "residents" ? (
        <section className="panel">
          <table className="dtable">
            <thead>
              <tr>
                <th>가명</th>
                <th>급여</th>
                <th>담당 작성자</th>
                <th>담당 시작일</th>
                <th>방문 요일</th>
                <th>방문 시간</th>
                <th aria-label="수정" />
              </tr>
            </thead>
            <tbody>
              {db.residents.map((resident) => (
                <tr key={resident.id}>
                  <td>
                    <b>{resident.alias.replace(" 어르신", "")}</b>
                  </td>
                  <td>{resident.careType === "home" ? "재가" : "시설"}</td>
                  <td>{db.worker.name}</td>
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
                    <button type="button" className="dbtn sm" onClick={() => setEditing(resident)}>
                      <Icon name="pencil" />
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {noDays && (
            <p className="warn-row">
              <Icon name="alert" />
              방문 요일을 정해야 못 쓴 기록을 알려 줄 수 있어요.
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
                <th>가입일</th>
                <th>이번 주 기록</th>
                <th aria-label="담당 연결" />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>{db.worker.name}</b>
                </td>
                <td>베트남어</td>
                <td>
                  {db.residents.map((resident) => resident.alias.replace(" 어르신", "")).join(", ")}
                </td>
                <td>{monthDay(db.residents[0]?.startDate ?? today)}</td>
                <td>{weekCount}건</td>
                <td>
                  <button
                    type="button"
                    className="dbtn sm"
                    onClick={() => db.residents[0] && setEditing(db.residents[0])}
                  >
                    담당 연결
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="info-note" style={{ margin: 16 }}>
            작성자는 설정의 작성자용 가입 코드로 직접 가입해요. 시연(Mock)에는 작성자가 한 명이에요.
          </p>
        </section>
      )}

      {editing && (
        <AssignDrawer
          key={editing.id}
          resident={editing}
          today={today}
          worker={db.worker.name}
          onClose={() => setEditing(null)}
          onSave={(edit) => {
            demo.update((current) => updateResident(current, editing.id, edit));
            setEditing(null);
            toast.show("담당 연결을 저장했어요.");
          }}
        />
      )}
      <AddResidentModal
        open={adding}
        today={today}
        onClose={() => setAdding(false)}
        onAdd={(input) => {
          const next = addResident(db, input);
          if ("error" in next) return next.error;
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

function AssignDrawer({
  resident,
  today,
  worker,
  onClose,
  onSave,
}: {
  resident: Resident;
  today: string;
  worker: string;
  onClose: () => void;
  onSave: (edit: Pick<Resident, "visitDays" | "visitTime" | "startDate">) => void;
}) {
  const home = resident.careType === "home";
  const [days, setDays] = useState<number[]>(resident.visitDays ?? []);
  const [startDate, setStartDate] = useState(resident.startDate);
  const [from, setFrom] = useState(resident.visitTime?.split("~")[0] ?? "");
  const [to, setTo] = useState(resident.visitTime?.split("~")[1] ?? "");
  const [error, setError] = useState<string | null>(null);
  const toggle = (day: number) =>
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));

  const save = () => {
    if (!startDate || startDate > today)
      return setError("담당 시작일은 오늘이나 그 전이어야 해요.");
    if (home && days.length === 0)
      return setError("재가 어르신은 방문 요일을 하나 이상 골라 주세요.");
    if ((from && !to) || (!from && to) || (from && to && from >= to))
      return setError("방문 시간은 시작이 끝보다 앞이어야 해요.");
    onSave({
      visitDays: home ? days : null,
      visitTime: from && to ? `${from}~${to}` : resident.visitTime,
      startDate,
    });
  };

  return (
    <DeskModal open onClose={onClose} label="담당 연결" drawer>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>담당 연결</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {resident.alias} · {home ? "재가 (별지 제12호)" : "시설 (별지 제16호)"}
          </p>
        </div>
        <button type="button" className="text-link" onClick={onClose}>
          닫기
        </button>
      </div>
      <label className="flabel" htmlFor="assign-worker">
        담당 작성자
      </label>
      <select id="assign-worker" className="select" defaultValue={worker}>
        <option value={worker}>{worker}</option>
      </select>
      <p className="fhint">가입한 작성자만 고를 수 있어요.</p>
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
      <p className="fhint">이 날부터 못 쓴 기록을 셉니다.</p>
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
  onClose,
  onAdd,
}: {
  open: boolean;
  today: string;
  onClose: () => void;
  onAdd: (input: {
    initial: string;
    careType: Resident["careType"];
    startDate: string;
  }) => "initial_required" | "duplicate" | null;
}) {
  const [initial, setInitial] = useState("");
  const [careType, setCareType] = useState<Resident["careType"]>("facility");
  const [error, setError] = useState<string | null>(null);
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
            const result = onAdd({ initial, careType, startDate: today });
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
