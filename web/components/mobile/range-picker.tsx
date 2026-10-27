"use client";

// W4 기간 거르기(화면 v1.3, 기록함기간 결정): 아래 모달 달력에서 두 번 눌러 기간을 고른다.
// 처음 누른 날 = 시작, 다음 누른 날 = 끝. 끝을 고른 뒤 다시 누르면 새 시작. 오늘 뒤는 못 고른다.
import { useState } from "react";

import { addDays, isoWeekday, monthDay } from "@/lib/demo/store";

import { Icon } from "./icon";
import { BottomSheet, BtnLabel } from "./parts";

export type DateRange = { start: string; end: string };

const dows = ["일", "월", "화", "수", "목", "금", "토"];

export function rangeLabel(range: DateRange) {
  if (range.start === range.end) return monthDay(range.start);
  const sameMonth = range.start.slice(0, 7) === range.end.slice(0, 7);
  return `${monthDay(range.start)} – ${sameMonth ? `${Number(range.end.slice(8, 10))}일` : monthDay(range.end)}`;
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(first: string, delta: number) {
  const [y, m] = first.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

export function RangePicker({
  open,
  today,
  initial,
  hasRecord,
  onClose,
  onApply,
}: {
  open: boolean;
  today: string;
  initial: DateRange | null;
  /** 그날 기록이 있으면 점을 찍는다. */
  hasRecord: (date: string) => boolean;
  onClose: () => void;
  onApply: (range: DateRange) => void;
}) {
  const [month, setMonth] = useState(monthStart(initial?.end ?? today));
  const [start, setStart] = useState<string | null>(initial?.start ?? null);
  const [end, setEnd] = useState<string | null>(initial?.end ?? null);

  const pick = (date: string) => {
    if (!start || end) {
      setStart(date);
      setEnd(null);
      return;
    }
    if (date < start) {
      setEnd(start);
      setStart(date);
    } else {
      setEnd(date);
    }
  };

  const range: DateRange | null = start ? { start, end: end ?? start } : null;
  const lead = isoWeekday(month) % 7; // 일요일 시작
  const nextMonth = shiftMonth(month, 1);
  const days: string[] = [];
  for (let d = month; d < nextMonth; d = addDays(d, 1)) days.push(d);
  const [y, m] = month.split("-").map(Number);

  return (
    <BottomSheet open={open} onClose={onClose} label="기간 고르기">
      <div className="month-nav">
        <button
          type="button"
          className="header-action"
          aria-label="이전 달"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <Icon name="back" />
        </button>
        <span>
          {y}년 {m}월
        </span>
        <button
          type="button"
          className="header-action"
          aria-label="다음 달"
          disabled={nextMonth > today}
          onClick={() => setMonth(nextMonth)}
        >
          <Icon name="next" />
        </button>
      </div>
      <button
        type="button"
        className="today-chip"
        style={{ font: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        onClick={() => setMonth(monthStart(today))}
      >
        오늘
      </button>
      <div className="month" role="grid" aria-label={`${y}년 ${m}월`}>
        {dows.map((dow) => (
          <span key={dow} className="dow">
            {dow}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((date) => {
          const inRange = range && date >= range.start && date <= range.end;
          const classes = [
            "d",
            hasRecord(date) ? "has" : "",
            inRange ? "in" : "",
            range && date === range.start ? "start" : "",
            range && date === range.end ? "end" : "",
            date === today ? "today" : "",
          ].join(" ");
          return (
            <button
              key={date}
              type="button"
              className={classes}
              disabled={date > today}
              aria-pressed={Boolean(inRange)}
              aria-label={monthDay(date)}
              onClick={() => pick(date)}
            >
              <span>{Number(date.slice(8, 10))}</span>
            </button>
          );
        })}
      </div>
      <p className="legend">점 = 그날 기록 있음</p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!range}
        onClick={() => range && onApply(range)}
      >
        <BtnLabel
          ko={range ? `${rangeLabel(range)} 기록 보기` : "날짜를 골라 주세요"}
          vi={range ? "Xem bản ghi" : "Hãy chọn ngày"}
        />
      </button>
    </BottomSheet>
  );
}
