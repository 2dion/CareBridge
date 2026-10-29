"use client";

// R3(승인한 기록): 왼쪽 목록, 오른쪽 내용과 진행 4단계. 인쇄·PDF는 /print/[id].
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { DeskShell } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import { approvedRecords } from "@/lib/demo/review";
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

function ApprovedDetail({ record }: { record: DemoRecord }) {
  const { db } = useDemo()!;
  const resident = getResident(db, record.residentId);
  const created = record.events.find((event) => event.type === "created");
  const submitted = [...record.events].reverse().find((event) => event.type === "submitted");
  const reviewEdits = record.events.filter(
    (event) =>
      (event.type === "edited" || event.type === "resolved") && event.actor === db.reviewer.name,
  );
  const lastReview = reviewEdits.at(-1);
  const edited = record.items
    .filter((item) => item.source === "reviewer")
    .map((item) => itemLabel(item.item_key).ko);
  const steps = [
    { label: "작성", who: record.workerName ?? db.worker.name, at: created?.at },
    {
      label: "전송",
      who: record.workerName ?? db.worker.name,
      at: submitted?.at ?? record.submittedAt,
    },
    {
      label: "검토·수정",
      who: `${db.reviewer.name}${edited.length ? ` · ${edited.join(", ")} 수정` : " · 수정 없음"}`,
      at: lastReview?.at ?? record.approvedAt,
    },
    { label: "승인", who: record.approvedBy, at: record.approvedAt },
  ];
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
      <ol className="timeline" aria-label="진행 단계">
        {steps.map((step) => (
          <li key={step.label}>
            <span className="dot">
              <Icon name="check" />
            </span>
            <b>{step.label}</b>
            <small>{step.who}</small>
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
