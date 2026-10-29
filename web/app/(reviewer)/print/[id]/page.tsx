"use client";

// 참고자료의 법정 원문 PDF에 값을 채운다. HTML로 대체 양식을 만들지 않는다.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { useToast } from "@/components/desk/shell";
import { formFieldHint } from "@/lib/demo/review";
import { displayOrder, getResident, itemLabel, monthDayWeek } from "@/lib/demo/store";
import { legalForms, type NoteArea, noteAreas, printableItem } from "@/lib/print/fields";
import { callApi } from "@/lib/real/actions";
import { applyPrintData, type PrintData } from "@/lib/real/map";

type GeneratedPdf = { url: string; key: string; recordPages: number; totalPages: number };

export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const demo = useDemo();
  const toast = useToast();
  const [notesArea, setNotesArea] = useState<NoteArea | "">("");
  const [generated, setGenerated] = useState<GeneratedPdf | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  useEffect(
    () => () => {
      if (generated) URL.revokeObjectURL(generated.url);
    },
    [generated],
  );

  if (!demo) return null;
  const { db } = demo;
  const record = db.records[id];
  if (!record)
    return (
      <main className="d-app p-app">
        <p style={{ padding: 32 }}>기록을 찾을 수 없어요.</p>
      </main>
    );
  const resident = getResident(db, record.residentId);
  const form = legalForms[record.formType];
  const title = `별지 제${record.formType}호 법정 양식`;
  const needsArea =
    record.formType === "16" && Boolean(printableItem(record, "notes")?.value_ko.trim());
  const resultKey = JSON.stringify([
    id,
    record.updatedAt,
    notesArea,
    record.items,
    record.formFields,
    resident?.alias,
    db.worker.org,
  ]);
  const result = generated?.key === resultKey ? generated : null;

  const generate = async () => {
    const current = ++request.current;
    setBusy(true);
    setError("");
    try {
      // 실제 모드는 서버 인쇄 데이터(GET /api/records/:id/print, 승인한 기록만)로 칸을 채운다
      let source = record;
      // 연습용 표시: 서버 인쇄 데이터의 is_training, 그 전에는 기관 값(이슈 #125)
      let training = Boolean(demo.real?.isTraining);
      if (demo.real) {
        const printed = await callApi<PrintData>(`/api/records/${id}/print`, { method: "GET" });
        if (!printed.ok) throw new Error(printed.ko);
        source = applyPrintData(record, printed.data);
        training = printed.data.is_training;
      }
      const [{ createRecordPdf }, templateResponse, fontResponse] = await Promise.all([
        import("@/lib/print/pdf"),
        fetch(form.href),
        fetch("/fonts/noto-sans-kr.ttf"),
      ]);
      if (!templateResponse.ok || !fontResponse.ok)
        throw new Error("양식이나 글꼴을 불러오지 못했어요. 다시 시도해 주세요.");
      const [template, fontBytes] = await Promise.all([
        templateResponse.arrayBuffer(),
        fontResponse.arrayBuffer(),
      ]);
      const pdf = await createRecordPdf({
        template: new Uint8Array(template),
        fontBytes: new Uint8Array(fontBytes),
        record: source,
        alias: resident?.alias ?? "",
        org: db.worker.org,
        notesArea,
        training,
      });
      if (current !== request.current) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(pdf.bytes)], { type: "application/pdf" }),
      );
      setGenerated({
        url,
        key: resultKey,
        recordPages: pdf.recordPages,
        totalPages: pdf.totalPages,
      });
    } catch (cause) {
      if (current === request.current)
        setError(
          cause instanceof Error ? cause.message : "PDF를 만들지 못했어요. 다시 시도해 주세요.",
        );
    } finally {
      if (current === request.current) setBusy(false);
    }
  };

  return (
    <main className="d-app p-app">
      <header className="p-bar no-print">
        <b>
          {title} · {resident?.alias} · {monthDayWeek(record.careDate)}
        </b>
        <div>
          <button
            type="button"
            className="dbtn"
            onClick={() =>
              router.push(record.status === "approved" ? `/approved?id=${id}` : `/review/${id}`)
            }
          >
            기록으로 돌아가기
          </button>
          <a className="dbtn" href={form.href} target="_blank" rel="noopener noreferrer">
            빈 원문 보기
          </a>
          {result && (
            <>
              <a
                className="dbtn"
                href={result.url}
                download={`carebridge-form-${record.formType}-${record.id}.pdf`}
              >
                기록 PDF 내려받기
              </a>
              <a
                className="dbtn primary"
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                기록 PDF 열기·인쇄
              </a>
            </>
          )}
        </div>
      </header>
      <section className="legal-form-layout no-print">
        <div className="legal-form-view">
          <section className="panel legal-form-record">
            <h1>법정 양식에 기록 채우기</h1>
            <p>
              {form.revised} 개정 원문의 {form.days}일 칸 중 첫 날짜 열을 사용합니다. 뒤쪽
              유의사항과 서명란은 그대로 남깁니다.
            </p>
            {needsArea && (
              <label className="flabel">
                특이사항을 넣을 영역 (관리자 선택)
                <select
                  className="field"
                  value={notesArea}
                  disabled={busy}
                  onChange={(event) => setNotesArea(event.target.value as NoteArea | "")}
                >
                  <option value="">영역을 골라 주세요</option>
                  {noteAreas.map(({ key, label }) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="info-note">
              기록에 없는 정보와 서명은 비워 둡니다. 칸보다 긴 내용은 같은 법정 양식에 이어 쓰며
              자르지 않습니다. PDF에 {demo.real?.isTraining ? "연습용·" : ""}합성 사례
              {record.status !== "approved" ? "·승인 전" : ""} 표시가 들어갑니다.
            </p>
            <button
              type="button"
              className="dbtn primary"
              disabled={busy || (needsArea && !notesArea)}
              onClick={generate}
            >
              {busy ? "기록 PDF 만드는 중" : "기록 채운 PDF 만들기"}
            </button>
            {error && (
              <p role="alert" className="warn-text">
                {error}
              </p>
            )}
            {result && (
              <p role="status">
                기록 {result.recordPages}쪽과 원문 뒤쪽을 포함해 총 {result.totalPages}쪽입니다.
              </p>
            )}
          </section>
          {result && (
            <>
              <iframe className="legal-form-pdf" title={`${title} 기록 PDF`} src={result.url} />
              <p>
                PDF가 보이지 않으면{" "}
                <a
                  className="text-link"
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  기록 PDF를 새 탭에서 열어 주세요.
                </a>
              </p>
            </>
          )}
        </div>
        <aside className="panel legal-form-record" aria-label="양식에 넣을 기록">
          <h2>양식에 넣을 기록</h2>
          <p>
            {resident?.alias} · {record.careDate} · {db.worker.org}
          </p>
          {record.status !== "approved" && <p className="info-note">승인 전 미리보기입니다.</p>}
          {displayOrder
            .filter((key) => key !== "next_check")
            .map((key) => {
              const item = printableItem(record, key);
              if (!item?.value_ko.trim()) return null;
              return (
                <section key={key} className="legal-form-item">
                  <h2>{itemLabel(key).ko}</h2>
                  <p className="muted">{formFieldHint[record.formType][key]}</p>
                  <p>{item.value_ko}</p>
                  {item.status === "needs_check" && !item.resolution && (
                    <span className="chip warn">확인 필요</span>
                  )}
                  <button
                    type="button"
                    className="dbtn sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(item.value_ko);
                        toast.show("내용을 복사했어요.");
                      } catch {
                        toast.show("복사하지 못했어요. 글을 직접 골라 복사해 주세요.");
                      }
                    }}
                  >
                    내용 복사
                  </button>
                </section>
              );
            })}
        </aside>
      </section>
      <p className="legal-print-help">
        화면의 ‘기록 PDF 열기·인쇄’에서 기록을 채운 법정 양식 PDF를 열어 인쇄해 주세요.
      </p>
      {toast.node}
    </main>
  );
}
