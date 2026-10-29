"use client";

// M3(승인한 기록): 왼쪽 목록, 오른쪽 내용과 처리 이력(작성 → 전송 → [검토·수정 → 되돌림 → 재전송] → 검토·수정 → 승인). 인쇄·PDF는 /print/[id].
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { DeskShell } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import { approvedRecords, type HistoryStep, processHistory } from "@/lib/demo/review";
import type { ItemKey } from "@/lib/demo/state";
import {
  type DemoRecord,
  displayOrder,
  getResident,
  itemLabel,
  kstDateOf,
  monthDay,
  monthDayWeek,
} from "@/lib/demo/store";

function shortStamp(iso: string | null | undefined) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${Number(get("month"))}/${Number(get("day"))} ${get("hour")}:${get("minute")}`;
}

export default function ApprovedPage() {
  return (
    <DeskShell active="approved">
      <Approved />
    </DeskShell>
  );
}

function Approved() {
  const router = useRouter();
  const params = useSearchParams();
  const { db } = useDemo()!;
  const [resident, setResident] = useState("all");
  const [month, setMonth] = useState("all");
  const all = approvedRecords(db);
  const months = [...new Set(all.map((record) => record.careDate.slice(0, 7)))];
  const rows = all.filter(
    (record) =>
      (resident === "all" || record.residentId === resident) &&
      (month === "all" || record.careDate.startsWith(month)),
  );
  const selected = rows.find((record) => record.id === params.get("id")) ?? rows[0];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>승인한 기록</h1>
          <p>승인한 기록을 보고 종이 서식으로 인쇄해요.</p>
        </div>
        <div className="actions">
          <select
            className="select"
            aria-label="어르신"
            value={resident}
            onChange={(event) => setResident(event.target.value)}
          >
            <option value="all">어르신 · 전체</option>
            {db.residents.map((item) => (
              <option key={item.id} value={item.id}>
                어르신 · {item.alias.replace(" 어르신", "")}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="날짜"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          >
            <option value="all">날짜 · 전체</option>
            {months.map((value) => (
              <option key={value} value={value}>
                날짜 · {Number(value.slice(5, 7))}월
              </option>
            ))}
          </select>
        </div>
      </header>
      {rows.length === 0 ? (
        <section className="panel" style={{ padding: 32, textAlign: "center" }}>
          승인한 기록이 없어요.
        </section>
      ) : (
        <div className="review-grid">
          <section className="panel list-panel" aria-label="승인한 기록 목록">
            {rows.map((record) => {
              const who = getResident(db, record.residentId);
              return (
                <button
                  key={record.id}
                  type="button"
                  className={`list-row ${record.id === selected?.id ? "on" : ""}`}
                  aria-current={record.id === selected?.id ? "true" : undefined}
                  onClick={() => router.replace(`/approved?id=${record.id}`)}
                >
                  <span>
                    <b>{who?.alias}</b>
                    <small>
                      {monthDayWeek(record.careDate)} · {who?.careType === "home" ? "재가" : "시설"}{" "}
                      · {record.workerName ?? db.worker.name}
                    </small>
                  </span>
                  <span className="chip green">승인 완료</span>
                  <Icon name="next" />
                </button>
              );
            })}
          </section>
          {selected && <ApprovedDetail record={selected} />}
        </div>
      )}
    </>
  );
}

const STEP_LABEL: Record<HistoryStep["kind"], string> = {
  created: "작성",
  submitted: "전송",
  resubmitted: "재전송",
  returned: "되돌림",
  reviewed: "검토·수정",
  approved: "승인",
};

const names = (keys: ItemKey[]) => keys.map((key) => itemLabel(key).ko).join(", ");

/** 단계 아래 줄: 누가 · 무엇을(관리자 수정·확인 처리, 되돌림 사유, 작성자가 고친 항목) */
function stepDetail(step: HistoryStep) {
  if (step.kind === "returned") return step.reason ? `${step.actor} · ${step.reason}` : step.actor;
  if (step.kind === "resubmitted") {
    return step.edited.length ? `${step.actor} · ${names(step.edited)} 고침` : step.actor;
  }
  if (step.kind !== "reviewed") return step.actor;
  const parts = [
    step.edited.length ? `${names(step.edited)} 수정` : "",
    ...(["confirmed_by_reviewer", "omitted"] as const).map((resolution) => {
      const keys = step.resolved
        .filter((entry) => entry.resolution === resolution)
        .map((entry) => entry.item_key);
      return keys.length
        ? `${names(keys)} ${resolution === "omitted" ? "기록 안 함" : "확인함"}`
        : "";
    }),
  ].filter(Boolean);
  return `${step.actor} · ${parts.length ? parts.join(" · ") : "수정 없음"}`;
}

function ApprovedDetail({ record }: { record: DemoRecord }) {
  const { db } = useDemo()!;
  const resident = getResident(db, record.residentId);
  // 처리 이력은 record_events 순서대로: 첫 전송·되돌림(사유)·재전송·확인 처리가 모두 보인다(이슈 #124)
  const steps = processHistory(record);
  const items = [...record.items]
    .filter((item) => item.value_ko.trim())
    .sort((a, b) => displayOrder.indexOf(a.item_key) - displayOrder.indexOf(b.item_key));

  return (
    <section className="panel" style={{ padding: 24 }}>
      <div className="page-head" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>
            {resident?.alias} · {monthDayWeek(record.careDate)}
          </h2>
          <p>
            {resident?.careType === "home" ? "재가" : "시설"} · 별지 제{record.formType}호 · 승인{" "}
            {record.approvedAt ? monthDay(kstDateOf(record.approvedAt)) : ""}{" "}
            {shortStamp(record.approvedAt).split(" ")[1]}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="dbtn" disabled title="가족 공유는 추후 적용">
            <Icon name="shield" />
            가족과 공유 · 준비 중
          </button>
          <Link className="dbtn primary" href={`/print/${record.id}`} target="_blank">
            <Icon name="print" />
            인쇄·PDF
          </Link>
        </div>
      </div>
      <ol className="timeline" aria-label="처리 이력">
        {steps.map((step, index) => (
          <li key={`${step.kind}-${index}`}>
            <span className="dot">
              <Icon name="check" />
            </span>
            <b>{STEP_LABEL[step.kind]}</b>
            <small>{stepDetail(step)}</small>
            <small>{shortStamp(step.at)}</small>
          </li>
        ))}
      </ol>
      <dl className="kv">
        {items.map((item) => (
          <div key={item.item_key}>
            <dt>{itemLabel(item.item_key).ko}</dt>
            <dd>
              {item.value_ko}
              {item.resolution === "confirmed_by_reviewer" && (
                <span className="muted"> (관리자 확인함)</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
