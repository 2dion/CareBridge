"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/demo/demo-provider";
import { DeskShell } from "@/components/desk/shell";
import { kstDateOf, monthDayWeek } from "@/lib/demo/store";
import { NoteAreaChecks } from "@/components/print/note-area-checks";
import { legalForms, printableItem, type NoteArea } from "@/lib/print/fields";
import {
  areasOf,
  missingAreas,
  mockPeriod,
  periodStart,
  serverPeriod,
  skipLabels,
  type PeriodResponse,
  type PeriodView,
} from "@/lib/print/period-view";
import { callApi } from "@/lib/real/actions";
import { addDays, daysBetween, isValidDate, MAX_PERIOD_DAYS } from "@/lib/records/period-print";

export default function PeriodPrintPage() {
  return (
    <DeskShell active="approved">
      <PeriodPrint />
    </DeskShell>
  );
}
function PeriodPrint() {
  const demo = useDemo()!;
  const params = useSearchParams();
  const today = kstDateOf(new Date().toISOString());
  const [residentId, setResidentId] = useState(params.get("resident") ?? "");
  const resident = demo.db.residents.find((entry) => entry.id === residentId);
  const formType = resident?.careType === "home" ? "12" : "16";
  const length = legalForms[formType].days;
  const [from, setFrom] = useState(() => {
    const requested = params.get("from");
    return requested && isValidDate(requested) && requested <= today
      ? requested
      : periodStart(today, formType);
  });
  // 찍을 날 수. 처음에는 서식 한 장 분량이고, 끝 날짜를 늘리면 날짜 수마다 새 서식 장이 생긴다(이슈 #317)
  const [span, setSpan] = useState<number>(length);
  const to = isValidDate(from) ? addDays(from, span - 1) : from;
  const [loaded, setLoaded] = useState<{ key: string; view?: PeriodView; error?: string } | null>(
    null,
  );
  const [retry, setRetry] = useState(0);
  const [areas, setAreas] = useState<Record<string, NoteArea[]>>({});
  const [busy, setBusy] = useState(false);
  const generationLock = useRef(false);
  const [pdfError, setPdfError] = useState("");
  const [generated, setGenerated] = useState<{ key: string; url: string; pages: number } | null>(
    null,
  );
  const valid = Boolean(resident) && isValidDate(from) && from <= today;
  const key = JSON.stringify([residentId, from, span, formType, retry]);
  const liveKey = useRef(key);
  useEffect(() => {
    liveKey.current = key;
    return () => {
      liveKey.current = "";
    };
  }, [key]);
  useEffect(() => {
    if (!valid || !demo.real) return;
    let cancelled = false;
    void callApi<PeriodResponse>(
      `/api/residents/${encodeURIComponent(residentId)}/print?from=${from}&to=${to}`,
      { method: "GET" },
    ).then((result) => {
      if (cancelled) return;
      setLoaded(
        result.ok
          ? { key, view: serverPeriod(result.data) }
          : {
              key,
              error:
                result.error === "not_approved"
                  ? "이 기간에는 승인한 기록이 없어요"
                  : "기록을 불러오지 못했어요.",
            },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [demo.real, valid, residentId, from, to, key]);
  useEffect(
    () => () => {
      if (generated) URL.revokeObjectURL(generated.url);
    },
    [generated],
  );
  const view = valid
    ? demo.real
      ? loaded?.key === key
        ? loaded.view
        : undefined
      : mockPeriod(demo.db, residentId, from, to)
    : undefined;
  const error = valid && demo.real && loaded?.key === key ? loaded.error : "";
  const loading = valid && Boolean(demo.real) && loaded?.key !== key;
  const count = view?.days.filter((day) => day.record).length ?? 0;
  const needsAreas = view ? missingAreas(view, areas) : false;
  const resultKey = JSON.stringify([key, view, areas]);
  const result = generated?.key === resultKey ? generated : null;
  const clearPdf = () => {
    setGenerated(null);
    setPdfError("");
  };
  const generate = async () => {
    if (!view || !count || needsAreas || generationLock.current) return;
    generationLock.current = true;
    setBusy(true);
    setPdfError("");
    const startedKey = key;
    try {
      const [{ createPeriodPdf }, template, font] = await Promise.all([
        import("@/lib/print/pdf"),
        fetch(legalForms[view.formType].href),
        fetch("/fonts/noto-sans-kr.ttf"),
      ]);
      if (!template.ok || !font.ok)
        throw new Error("서식이나 글꼴을 불러오지 못했어요. 다시 시도해 주세요.");
      const [templateBytes, fontBytes] = await Promise.all([
        template.arrayBuffer(),
        font.arrayBuffer(),
      ]);
      const pdf = await createPeriodPdf({
        template: new Uint8Array(templateBytes),
        fontBytes: new Uint8Array(fontBytes),
        writer: demo.db.worker.name,
        formType: view.formType,
        days: view.days.flatMap((day, column) =>
          day.record ? [{ record: day.record, column, notesAreas: areasOf(areas, day.date) }] : [],
        ),
        residentName: resident!.name,
        org: demo.db.worker.org,
        from: view.from,
        to: view.to,
        training: view.training,
      });
      if (liveKey.current !== startedKey) return;
      setGenerated({
        key: resultKey,
        url: URL.createObjectURL(
          new Blob([new Uint8Array(pdf.bytes)], { type: "application/pdf" }),
        ),
        pages: pdf.totalPages,
      });
    } catch (cause) {
      if (liveKey.current === startedKey)
        setPdfError(cause instanceof Error ? cause.message : "PDF를 만들지 못했어요.");
    } finally {
      generationLock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <header className="page-head">
        <div>
          <h1>기간 인쇄</h1>
          <p>한 어르신의 승인한 기록을 서식의 날짜 열에 모아 찍어요.</p>
        </div>
        <Link className="dbtn" href="/approved">
          승인한 기록으로 돌아가기
        </Link>
      </header>
      <section className="panel" style={{ padding: 24 }}>
        <div className="actions" style={{ flexWrap: "wrap", alignItems: "end" }}>
          <label className="flabel">
            어르신
            <select
              className="field"
              value={residentId}
              disabled={busy}
              onChange={(event) => {
                const id = event.target.value;
                const selected = demo.db.residents.find((entry) => entry.id === id);
                setResidentId(id);
                const selectedForm = selected?.careType === "home" ? "12" : "16";
                setFrom(periodStart(today, selectedForm));
                setSpan(legalForms[selectedForm].days);
                setAreas({});
                clearPdf();
              }}
            >
              <option value="">어르신을 골라 주세요</option>
              {demo.db.residents.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flabel">
            시작 날짜
            <input
              className="field"
              type="date"
              max={today}
              value={from}
              disabled={!resident || busy}
              onChange={(event) => {
                setFrom(event.target.value);
                setAreas({});
                clearPdf();
              }}
            />
          </label>
          <label className="flabel">
            끝 날짜
            <input
              className="field"
              type="date"
              min={from}
              max={isValidDate(from) ? addDays(from, MAX_PERIOD_DAYS - 1) : undefined}
              value={to}
              disabled={!resident || busy || !isValidDate(from)}
              onChange={(event) => {
                const next = event.target.value;
                if (!isValidDate(next)) return;
                setSpan(Math.min(MAX_PERIOD_DAYS, Math.max(1, daysBetween(from, next))));
                setAreas({});
                clearPdf();
              }}
            />
          </label>
        </div>
        {!resident ? (
          <p className="info-note">인쇄할 어르신을 골라 주세요.</p>
        ) : (
          <>
            <h2>
              별지 제{formType}호 · 한 장에 {length}일 · 서식 {Math.ceil(span / length)}장
            </h2>
            {isValidDate(from) && (
              <p>
                {monthDayWeek(from)} ~ {monthDayWeek(to)} ({span}일)
              </p>
            )}
            <div className="actions">
              <button
                className="dbtn"
                disabled={!valid || busy}
                onClick={() => {
                  setFrom(addDays(from, -span));
                  setAreas({});
                  clearPdf();
                }}
              >
                ‹ 이전 기간
              </button>
              <button
                className="dbtn"
                disabled={!valid || busy || addDays(from, span) > today}
                onClick={() => {
                  setFrom(addDays(from, span));
                  setAreas({});
                  clearPdf();
                }}
              >
                다음 기간 ›
              </button>
            </div>
            {!valid && <p role="alert">시작 날짜는 오늘까지 골라 주세요.</p>}
            {loading && <p role="status">기록을 불러오는 중이에요.</p>}
            {error && (
              <p role="alert">
                {error}{" "}
                <button
                  className="dbtn"
                  onClick={() => {
                    setRetry((value) => value + 1);
                    setAreas({});
                    clearPdf();
                  }}
                >
                  다시 불러오기
                </button>
              </p>
            )}
            {view && (
              <>
                <p role="status">
                  {count
                    ? `${view.days.length}일 중 ${count}일을 찍어요`
                    : "이 기간에는 승인한 기록이 없어요"}
                </p>
                <ol style={{ paddingLeft: 24 }}>
                  {view.days.map((day) => (
                    <li
                      key={day.date}
                      style={{ padding: "16px 0", borderBottom: "1px solid #e1e8e3" }}
                    >
                      <b>{monthDayWeek(day.date)}</b>
                      {day.record ? (
                        <>
                          {" "}
                          <span className="chip green">승인 완료</span>{" "}
                          <span>{day.record.workerName ?? demo.db.worker.name}</span>
                          {formType === "16" &&
                            Boolean(printableItem(day.record, "notes")?.value_ko.trim()) && (
                              <NoteAreaChecks
                                legend="특이사항을 넣을 영역"
                                value={areasOf(areas, day.date)}
                                disabled={busy}
                                onChange={(next) => {
                                  setAreas((previous) => ({ ...previous, [day.date]: next }));
                                  clearPdf();
                                }}
                              />
                            )}
                        </>
                      ) : (
                        <span className="muted"> · {skipLabels[day.skipped] ?? "기록 없음"}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
        <p className="info-note">
          승인한 기록만 채우고 서명과 없는 정보는 비워 둡니다. 합성 사례 · 공식 기록지 아님
          {view?.training ? " · 연습용" : ""} 표시가 들어갑니다.
        </p>
        {needsAreas && <p role="status">특이사항 영역을 하나 이상 골라 주세요.</p>}
        <button
          className="dbtn primary"
          disabled={busy || loading || !count || needsAreas}
          onClick={generate}
        >
          {busy ? "PDF 만드는 중" : "PDF 만들기"}
        </button>
        {pdfError && (
          <p role="alert" className="warn-text">
            {pdfError}
          </p>
        )}
        {result && (
          <div style={{ marginTop: 20 }}>
            <p role="status">총 {result.pages}쪽 PDF를 만들었어요.</p>
            <div className="actions">
              <a
                className="dbtn"
                href={result.url}
                download={`carebridge-period-${residentId}-${from}.pdf`}
              >
                PDF 내려받기
              </a>
              <a
                className="dbtn primary"
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                PDF 열기·인쇄
              </a>
            </div>
            <iframe
              className="legal-form-pdf"
              title="기간 인쇄 PDF"
              src={result.url}
              style={{ width: "100%", marginTop: 20 }}
            />
          </div>
        )}
      </section>
    </>
  );
}
