"use client";

// W4(기록): 작성 전 / 임시 저장 / 전송 완료 / 수정 필요 / 승인 완료, 기간 거르기, 기록 없음 처리.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Icon } from "@/components/mobile/icon";
import { BottomSheet, BtnLabel } from "@/components/mobile/parts";
import { type DateRange, RangePicker, rangeLabel } from "@/components/mobile/range-picker";
import { AppBar, Loading, MobileScreen, StatusBadge } from "@/components/mobile/shell";
import type { RecordStatus } from "@/lib/demo/state";
import {
  addNoCareDay,
  type DemoDb,
  type DemoRecord,
  getResident,
  kstTime,
  listMissed,
  type MissedRecord,
  monthDay,
  monthDayWeek,
  type NoCareReason,
  noCareReasonLabel,
  weekdayLabel,
  workerRecords,
} from "@/lib/demo/store";

type Tab = "missed" | "draft" | "submitted" | "returned" | "approved";

const tabs: { key: Tab; label: string }[] = [
  { key: "missed", label: "작성 전" },
  { key: "draft", label: "임시 저장" },
  { key: "submitted", label: "전송 완료" },
  { key: "returned", label: "수정 필요" },
  { key: "approved", label: "승인 완료" },
];

const empties: Record<Tab, { ko: string; vi: string }> = {
  missed: { ko: "작성 전 기록이 없습니다.", vi: "Không có bản ghi chưa viết." },
  draft: { ko: "임시 저장한 기록이 없습니다.", vi: "Không có bản ghi lưu tạm." },
  submitted: { ko: "전송 완료된 기록이 없습니다.", vi: "Không có bản ghi đã gửi." },
  returned: { ko: "수정 필요 기록이 없습니다.", vi: "Không có bản ghi cần sửa." },
  approved: { ko: "승인 완료된 기록이 없습니다.", vi: "Không có bản ghi đã duyệt." },
};

function isTab(value: string | null): value is Tab {
  return tabs.some((tab) => tab.key === value);
}

function recordHref(record: DemoRecord) {
  if (record.status === "submitted" || record.status === "approved")
    return `/records/${record.id}/view`;
  if (record.draftState === "ready" || record.status === "returned") return `/records/${record.id}`;
  return `/start/${record.residentId}?date=${record.careDate}`;
}

function DateBox({ date }: { date: string }) {
  return (
    <div className="date-box">
      <span>{Number(date.slice(5, 7))}월</span>
      <b>{Number(date.slice(8, 10))}일</b>
      <span>({weekdayLabel(date)})</span>
    </div>
  );
}

export default function ArchivePage() {
  const search = useSearchParams();
  const router = useRouter();
  const demo = useDemo();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [range, setRange] = useState<DateRange | null>(null);
  const [noCare, setNoCare] = useState<MissedRecord | null>(null);
  const tabParam = search.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "missed";

  if (!demo) return <Loading tab="archive" />;
  const { db, today } = demo;
  const missed = listMissed(db, today);
  const records = workerRecords(db).filter((record) => record.draftState !== "empty");
  const byStatus = (status: RecordStatus) => records.filter((record) => record.status === status);
  const counts: Record<Tab, number> = {
    missed: missed.length,
    draft: byStatus("draft").length,
    submitted: byStatus("submitted").length,
    returned: byStatus("returned").length,
    approved: byStatus("approved").length,
  };
  const setTab = (next: Tab) => router.replace(`/archive?tab=${next}`, { scroll: false });

  return (
    <MobileScreen tab="archive">
      <AppBar
        title="기록"
        vi="Danh sách bản ghi"
        right={
          <button
            type="button"
            className="header-action"
            aria-label="날짜로 거르기"
            onClick={() => setPickerOpen(true)}
          >
            <Icon name="calendar" />
          </button>
        }
      />
      {range ? (
        <RangeList
          db={db}
          today={today}
          range={range}
          missed={missed}
          onClear={() => setRange(null)}
        />
      ) : (
        <>
          <div className="filters scroll-x" role="tablist" aria-label="기록 상태">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={item.key === tab}
                className={`filter ${item.key === tab ? "on" : ""}`}
                onClick={() => setTab(item.key)}
              >
                {item.label}
                {item.key === "missed" && counts.missed > 0 && (
                  <span className="count">{counts.missed}</span>
                )}
              </button>
            ))}
          </div>
          <div className="list-head">
            기록 목록<span className="badge badge-green">{counts[tab]}개</span>
          </div>
          {counts[tab] === 0 ? (
            <div className="empty" style={{ marginTop: 40 }}>
              <p>{empties[tab].ko}</p>
              <span className="vi">{empties[tab].vi}</span>
            </div>
          ) : tab === "missed" ? (
            <div className="rec-list">
              {missed.map((row) => (
                <MissedCard
                  key={`${row.residentId}-${row.careDate}`}
                  db={db}
                  row={row}
                  onNoCare={setNoCare}
                />
              ))}
              <p className="foot-note" style={{ margin: "4px 6px 0" }}>
                기록 없는 날은 7일이 지나면 쓸 수 없어요. 그때는 관리자에게 알려 주세요.
                <span className="vi">
                  Sau 7 ngày sẽ không thể viết. Khi đó hãy báo người quản lý.
                </span>
              </p>
              <p className="foot-note" style={{ margin: "0 6px 16px" }}>
                돌봄 날짜보다 늦게 전송한 기록은 관리자 화면에 ‘지연전송’으로 보여요.
                <span className="vi">
                  Bản ghi gửi muộn sẽ hiện là “gửi muộn” cho người quản lý.
                </span>
              </p>
            </div>
          ) : (
            <div className="rec-list" style={{ paddingBottom: 16 }}>
              {byStatus(tab).map((record) => (
                <RecordRow key={record.id} db={db} record={record} />
              ))}
            </div>
          )}
        </>
      )}
      <RangePicker
        key={pickerOpen ? "open" : "closed"}
        open={pickerOpen}
        today={today}
        initial={range}
        hasRecord={(date) => records.some((record) => record.careDate === date)}
        onClose={() => setPickerOpen(false)}
        onApply={(next) => {
          setRange(next);
          setPickerOpen(false);
        }}
      />
      <NoCareSheet
        row={noCare}
        db={db}
        onClose={() => setNoCare(null)}
        onSave={(change, day) => {
          if (demo.real) {
            // no_care_days에 바로 넣는다(작성자, 내 담당 어르신, 오늘~7일 전)
            return demo.real.actions.addNoCare(day).then((result) => {
              if (result.ok) setNoCare(null);
              return result.ok ? "" : `${result.ko} ${result.vi}`;
            });
          }
          demo.update(change);
          setNoCare(null);
          return Promise.resolve("");
        }}
        today={today}
      />
    </MobileScreen>
  );
}

function MissedCard({
  db,
  row,
  onNoCare,
}: {
  db: DemoDb;
  row: MissedRecord;
  onNoCare: (row: MissedRecord) => void;
}) {
  const resident = getResident(db, row.residentId);
  const record = row.recordId ? db.records[row.recordId] : undefined;
  if (!resident) return null;
  return (
    <article className="arch-card card">
      <div className="top">
        <DateBox date={row.careDate} />
        <div className="meta">
          <b>{monthDay(row.careDate)} 일일 기록</b>
          <span>{resident.alias}</span>
        </div>
        <StatusBadge status={row.kind === "draft" ? "draft" : "not_started"} />
      </div>
      {row.kind === "draft" && record ? (
        <Link className="btn btn-outline btn-sm btn-center" href={recordHref(record)}>
          <Icon name="pencil" />
          <BtnLabel ko="이어 쓰기" vi="Viết tiếp" />
        </Link>
      ) : (
        <div className="btn-row">
          <Link
            className="btn btn-outline btn-sm btn-center"
            href={`/start/${row.residentId}?date=${row.careDate}`}
          >
            <Icon name="pencil" />
            <BtnLabel ko="지금 쓰기" vi="Viết ngay" />
          </Link>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onNoCare(row)}>
            <BtnLabel ko="이 날 기록 없음" vi="Không có chăm sóc" />
          </button>
        </div>
      )}
    </article>
  );
}

function RecordRow({ db, record }: { db: DemoDb; record: DemoRecord }) {
  const resident = getResident(db, record.residentId);
  const time =
    record.status === "approved"
      ? kstTime(record.approvedAt)
      : record.status === "returned"
        ? kstTime(record.returnedAt)
        : kstTime(record.submittedAt ?? record.updatedAt);
  return (
    <Link className="rec-row" href={recordHref(record)} style={{ flexWrap: "wrap" }}>
      <DateBox date={record.careDate} />
      <div className="meta">
        <b>일일 기록</b>
        <span>
          {resident?.alias} · {time}
        </span>
      </div>
      <StatusBadge status={record.status} />
      <Icon name="next" />
      {record.status === "returned" && record.returnReason && (
        <div className="reason-box" style={{ flexBasis: "100%", marginTop: 0 }}>
          {record.returnReason}
          {record.returnReasonNative && (
            <span className="vi" style={{ display: "block" }}>
              {record.returnReasonNative}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function RangeList({
  db,
  today,
  range,
  missed,
  onClear,
}: {
  db: DemoDb;
  today: string;
  range: DateRange;
  missed: MissedRecord[];
  onClear: () => void;
}) {
  const inRange = (date: string) => date >= range.start && date <= range.end;
  const records = workerRecords(db).filter(
    (record) => record.draftState !== "empty" && inRange(record.careDate),
  );
  const missing = missed.filter((row) => row.kind === "missing" && inRange(row.careDate));
  const dates = [...new Set([...records.map((r) => r.careDate), ...missing.map((r) => r.careDate)])]
    .sort()
    .reverse();
  const total = records.length + missing.length;
  return (
    <>
      <div className="range-bar">
        <span className="icon-bubble sm">
          <Icon name="calendar" />
        </span>
        <b>{rangeLabel(range)}</b>
        <small>기간 선택</small>
        <button
          type="button"
          className="x-btn"
          aria-label="기간 거르기 지우기"
          onClick={onClear}
          style={{ border: 0 }}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="list-head" style={{ marginBottom: 4 }}>
        기록 목록<span className="badge badge-green">{total}건</span>
      </div>
      <div className="rec-list" style={{ paddingBottom: 16 }}>
        {dates.length === 0 && (
          <p className="foot-note" style={{ margin: "14px 0 0" }}>
            이 기간에는 기록이 없어요.
          </p>
        )}
        {dates.map((date) => (
          <section key={date} className="stack" style={{ gap: 8 }}>
            <div className="group-head" style={{ marginTop: 8 }}>
              {monthDayWeek(date)}
              {date === today ? " · 오늘" : ""}
            </div>
            {records
              .filter((record) => record.careDate === date)
              .map((record) => (
                <RecordRow key={record.id} db={db} record={record} />
              ))}
            {missing
              .filter((row) => row.careDate === date)
              .map((row) => (
                <div key={row.residentId} className="rec-row">
                  <DateBox date={date} />
                  <div className="meta">
                    <b>일일 기록</b>
                    <span>{getResident(db, row.residentId)?.alias} · 아직 작성하지 않았어요.</span>
                  </div>
                  <Link className="pill pill-write" href={`/start/${row.residentId}?date=${date}`}>
                    <Icon name="pencil" />
                    지금 쓰기
                  </Link>
                </div>
              ))}
          </section>
        ))}
        <p className="foot-note" style={{ margin: "14px 0 0" }}>
          선택한 기간의 기록만 표시하고 있어요.
        </p>
      </div>
    </>
  );
}

const reasons: NoCareReason[] = ["hospital", "overnight", "visit_cancelled", "other"];

function NoCareSheet({
  row,
  db,
  today,
  onClose,
  onSave,
}: {
  row: MissedRecord | null;
  db: DemoDb;
  today: string;
  onClose: () => void;
  onSave: (
    change: (db: DemoDb) => DemoDb,
    day: { residentId: string; careDate: string; reason: NoCareReason; note: string },
  ) => Promise<string>;
}) {
  const [reason, setReason] = useState<NoCareReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const resident = row ? getResident(db, row.residentId) : undefined;
  const close = () => {
    setReason(null);
    setNote("");
    setError("");
    onClose();
  };
  const save = () => {
    if (!row || !reason) return;
    const next = addNoCareDay(
      db,
      { residentId: row.residentId, careDate: row.careDate, reason, note: note.trim() },
      today,
    );
    if ("error" in next) {
      setError(
        next.error === "note_required"
          ? "기타 사유를 적어 주세요."
          : next.error === "has_record"
            ? "이미 기록이 있는 날이에요."
            : "7일이 지나 처리할 수 없어요. 관리자에게 알려 주세요.",
      );
      return;
    }
    const day = { residentId: row.residentId, careDate: row.careDate, reason, note: note.trim() };
    void onSave(() => next, day).then((failed) => {
      if (failed) return setError(failed);
      setReason(null);
      setNote("");
      setError("");
    });
  };
  return (
    <BottomSheet open={row !== null} onClose={close} label="이 날은 돌봄이 없었나요?">
      {row && (
        <>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>이 날은 돌봄이 없었나요?</h2>
            <span className="vi" style={{ fontSize: 13 }}>
              Ngày này không có chăm sóc?
            </span>
            <p style={{ marginTop: 4, fontSize: 14, color: "var(--color-sub)" }}>
              {monthDayWeek(row.careDate)} · {resident?.alias}
            </p>
          </div>
          <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="사유">
            {reasons.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={reason === key}
                className={`radio-row ${reason === key ? "on" : ""}`}
                onClick={() => setReason(key)}
              >
                <span className="radio" />
                <span>
                  <b>{noCareReasonLabel[key].ko}</b>
                  <span className="vi">{noCareReasonLabel[key].vi}</span>
                </span>
              </button>
            ))}
          </div>
          {reason === "other" && (
            <textarea
              className="input"
              style={{ minHeight: 80 }}
              aria-label="기타 사유"
              placeholder="사유를 적어 주세요."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
          {resident?.careType === "facility" && (
            <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
              하루 중 일부만 외박·외출했으면 이 버튼 대신 기록을 쓰고 ‘방문 시점’에 적어 주세요.
            </p>
          )}
          {error && (
            <p className="reason-box" role="alert" style={{ marginTop: 0 }}>
              {error}
            </p>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-outline"
              onClick={close}
              style={{ flex: "0 0 34%" }}
            >
              <BtnLabel ko="취소" vi="Hủy" />
            </button>
            <button type="button" className="btn btn-primary" disabled={!reason} onClick={save}>
              <BtnLabel ko="기록 없음으로 처리" vi="Xác nhận không có chăm sóc" />
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
