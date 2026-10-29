"use client";

// M2(기록 검토): 왼쪽 원문·번역, 오른쪽 항목.
// 관리자는 항목을 고치거나 ‘확인 필요’를 [확인함]/[기록 안 함]으로 정한다. 하나라도 안 정하면 승인할 수 없다(원칙 3).
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { DeskModal, DeskShell, receivedLabel, useToast } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import {
  approveRecord,
  formFieldHint,
  frozenOrder,
  mockAgentSteps,
  resolveItem,
  returnRecord,
  reviewerEditItem,
  reviewOrder,
  sourceSummary,
} from "@/lib/demo/review";
import type { RoleNames } from "@/lib/demo/roles";
import { countUnresolved, type ItemKey } from "@/lib/demo/state";
import {
  canApproveRecord,
  type DemoRecord,
  getResident,
  itemLabel,
  kstTime,
  lateDays,
  monthDayWeek,
  type RecordItem,
  supportMinuteKeys,
  supportMinutesTotal,
  visitMinutes,
} from "@/lib/demo/store";

const NOTES_LIMIT = 200;
const TOOL_NAMES: Record<string, string> = {
  get_form_spec: "서식 기준 조회",
  search_glossary: "용어 검색",
  validate_draft: "기록 검증",
  return_draft: "초안 반환",
};
const RETURN_LIMIT = 300;

export default function ReviewRecordPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DeskShell active="review">
      {/* 기록이 바뀌면 새로 그려 카드 순서를 그 기록 기준으로 다시 잡는다(이슈 #140) */}
      <ReviewRecord key={id} />
    </DeskShell>
  );
}

/** 문장 단위로 나눠 근거 문장을 노랗게 칠한다. */
function sentences(text: string) {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function evidenceHit(line: string, evidence: string) {
  const key = evidence.trim();
  if (key.length < 2) return false;
  return line.includes(key) || key.includes(line.replace(/[.?!]$/, ""));
}

function itemChip(item: RecordItem, names: RoleNames) {
  if (item.status === "needs_check") return <span className="chip warn">확인 필요</span>;
  if (item.source === "worker") return <span className="chip blue">{names.worker} 수정</span>;
  if (item.source === "reviewer") return <span className="chip blue">{names.reviewer} 수정</span>;
  if (item.status === "observed") return <span className="chip green">관찰</span>;
  return <span className="chip gray">언급 없음</span>;
}

function ReviewRecord() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const demo = useDemo()!;
  const { db, today } = demo;
  const toast = useToast();
  const names = useRoleNames();
  const record = db.records[id];
  const [selected, setSelected] = useState<ItemKey | null>(null);
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState("");
  // 승인은 되돌릴 수 없어 한 번 더 묻고, 승인·되돌리기 요청 중에는 버튼을 잠근다(이슈 #136)
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [busy, setBusy] = useState<"approve" | "return" | null>(null);
  const [realSteps, setRealSteps] = useState<
    { tool: string; key: string; name: string; reason: string; result: string }[]
  >([]);
  const realActions = demo.real?.actions;
  // 카드 순서는 화면을 연 때 한 번만 정한다. [확인함]/[기록 안 함]을 골라도 카드가 움직이지 않는다(이슈 #140)
  const [orderKeys] = useState<ItemKey[]>(() =>
    record ? reviewOrder(record).map((item) => item.item_key) : [],
  );
  // M2 'AI 작업 기록': agent_steps(관리자는 같은 기관 읽기)
  useEffect(() => {
    if (!realActions) return;
    let alive = true;
    void realActions.agentSteps(id).then((rows) => {
      if (!alive) return;
      setRealSteps(
        rows.map((row) => ({
          tool: row.tool,
          key: String(row.step_no),
          name: TOOL_NAMES[row.tool] ?? row.tool,
          reason: row.reason,
          result: row.result_summary,
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [realActions, id]);

  if (!record) {
    return (
      <section className="panel" style={{ padding: 32 }}>
        <p>기록을 찾을 수 없어요.</p>
        <Link className="back-link" href="/review">
          <Icon name="back" />
          검토 대기
        </Link>
      </section>
    );
  }

  const resident = getResident(db, record.residentId);
  const now = () => new Date().toISOString();
  const unresolved = countUnresolved(record.items);
  const reviewable = record.status === "submitted";
  const late = lateDays(record) ?? 0;
  const order = frozenOrder(record, orderKeys);
  const summary = sourceSummary(record);
  const resolvedCount = record.items.filter(
    (item) => item.status === "needs_check" && item.resolution !== null,
  ).length;
  const selectedItem = record.items.find((item) => item.item_key === selected);
  // 관리자가 고친 항목은 옛 근거 문장을 '지금 근거'처럼 노랗게 칠하지 않는다(이슈 #134)
  const highlight = selectedItem && selectedItem.source !== "reviewer" ? selectedItem : null;
  const native = record.transcript !== record.transcriptKo;
  const real = demo.real;
  const steps = real
    ? realSteps
    : mockAgentSteps(record).map((step) => ({ ...step, key: String(step.tool) }));
  const fail = (result: { ko: string }) => toast.show(result.ko);

  const approve = () => {
    setConfirmingApprove(false);
    if (busy) return;
    if (real) {
      // 서버가 다시 검사한다(원칙 3). 남은 '확인 필요'가 있으면 409와 항목 목록
      setBusy("approve");
      void real.actions.approve(record.id).then((result) => {
        setBusy(null);
        if (!result.ok) return fail(result);
        router.push(`/approved?id=${record.id}`);
      });
      return;
    }
    const next = approveRecord(db, record.id, now());
    if ("error" in next) {
      toast.show(`확인 필요 ${unresolved}개를 먼저 정해 주세요.`);
      return;
    }
    demo.update(() => next);
    router.push(`/approved?id=${record.id}`);
  };

  return (
    <>
      <Link className="back-link" href="/review">
        <Icon name="back" />
        검토 대기
      </Link>
      <header className="page-head">
        <div>
          <h1>
            {resident?.alias} · {monthDayWeek(record.careDate)}
          </h1>
          <p>
            {resident?.careType === "home" ? "재가" : "시설"} · 별지 제{record.formType}호 ·{" "}
            {names.worker} {record.workerName ?? db.worker.name} · 받은 시각{" "}
            {receivedLabel(record.submittedAt, today)}
            {late > 0 && (
              <>
                {" "}
                <span className="chip blue">지연전송 · {late}일 뒤</span>
              </>
            )}
          </p>
        </div>
        {reviewable && (
          <div className="actions">
            <span className={`summary-checks ${unresolved === 0 ? "ok" : ""}`} role="status">
              <Icon name={unresolved === 0 ? "check" : "alert"} />
              {unresolved === 0 ? "모두 정했어요" : `확인 필요 ${unresolved}개 남음`}
            </span>
            <Link className="dbtn" href={`/print/${record.id}`} target="_blank">
              <Icon name="eye" />
              미리보기
            </Link>
            <button
              type="button"
              className="dbtn danger"
              disabled={busy !== null}
              onClick={() => setReturning(true)}
            >
              <Icon name="undo" />
              되돌리기
            </button>
            <button
              type="button"
              className="dbtn primary"
              disabled={!canApproveRecord(record) || busy !== null}
              onClick={() => setConfirmingApprove(true)}
              title={unresolved > 0 ? "확인 필요를 모두 정해야 승인할 수 있어요" : undefined}
            >
              <Icon name="check" />
              {busy === "approve" ? "승인하는 중" : "승인"}
            </button>
          </div>
        )}
      </header>

      {!reviewable && (
        <p className="info-note" role="status" style={{ marginBottom: 16 }}>
          {record.status === "approved"
            ? `승인한 기록이에요 (${record.approvedBy} · ${kstTime(record.approvedAt)}). `
            : record.status === "returned"
              ? `${names.worker}에게 되돌린 기록이에요. ${names.worker}가 고쳐 다시 전송하면 검토 대기에 보여요. `
              : `${names.worker}가 아직 전송하지 않은 기록이에요. `}
          {record.status === "approved" && (
            <Link className="text-link" href={`/approved?id=${record.id}`}>
              승인한 기록에서 보기
            </Link>
          )}
        </p>
      )}

      <section className="panel summary">
        <span>
          {names.worker} 수정: {summary.worker.map((key) => itemLabel(key).ko).join(", ") || "없음"}{" "}
          · {names.reviewer} 수정:{" "}
          {summary.reviewer.map((key) => itemLabel(key).ko).join(", ") || "없음"} · AI 그대로{" "}
          {summary.aiCount}개
        </span>
        <span className={`checks ${unresolved === 0 ? "ok" : ""}`}>
          확인 필요 {unresolved} · 처리 완료 {resolvedCount}
        </span>
      </section>

      <div className="review-grid">
        <section className="panel source-panel" aria-label="원문">
          <div className="panel-head">
            원문 <span className="chip gray">받아쓴 글 그대로</span>
          </div>
          {sentences(record.transcript).map((line, index) => (
            <p
              key={`o-${index}`}
              className={`line ${highlight && evidenceHit(line, highlight.evidence) ? "hl" : ""}`}
            >
              {line}
            </p>
          ))}
          <hr />
          <div className="panel-head">한국어 번역</div>
          {native ? (
            sentences(record.transcriptKo).map((line, index) => (
              <p
                key={`k-${index}`}
                className={`line ${highlight && evidenceHit(line, highlight.evidence) ? "hl" : ""}`}
              >
                {line}
              </p>
            ))
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              {names.worker}가 한국어로 말해 번역이 필요 없습니다.
            </p>
          )}
          <p className="hint-note">
            <Icon name="info" />
            {selectedItem && !highlight
              ? `${itemLabel(selectedItem.item_key).ko}은(는) ${names.reviewer}가 고친 항목이라 고치기 전 근거를 칠하지 않아요`
              : selectedItem
                ? `노란 줄 = 오른쪽에서 고른 항목(${itemLabel(selectedItem.item_key).ko})의 근거 문장`
                : "오른쪽 항목을 누르면 근거 문장을 노랗게 보여 줘요"}
          </p>
        </section>

        <div className="items">
          {order.map((item) => (
            <ReviewItem
              key={item.item_key}
              record={record}
              item={item}
              selected={selected === item.item_key}
              editable={reviewable}
              onSelect={() => setSelected(item.item_key)}
              onEdit={(value) => {
                if (real) {
                  void real.actions
                    .patchItem(record.id, item.item_key, { value_ko: value })
                    .then((result) => !result.ok && fail(result));
                  return;
                }
                demo.update((current) =>
                  reviewerEditItem(current, record.id, item.item_key, value, now()),
                );
              }}
              onResolve={(resolution, note) => {
                const next = resolveItem(db, record.id, item.item_key, resolution, note, now());
                if ("error" in next) return false;
                if (real) {
                  // [확인함]/[기록 안 함]·사유는 PATCH resolution·resolution_note
                  void real.actions
                    .patchItem(record.id, item.item_key, {
                      resolution,
                      ...(resolution === "omitted" ? { resolution_note: note.trim() } : {}),
                    })
                    .then((result) => !result.ok && fail(result));
                  return true;
                }
                demo.update(() => next);
                return true;
              }}
              onCopy={async () => {
                try {
                  await navigator.clipboard.writeText(item.value_ko);
                  toast.show("특이사항을 복사했어요.");
                } catch {
                  toast.show("복사하지 못했어요. 글을 직접 골라 복사해 주세요.");
                }
              }}
            />
          ))}
          <details className="panel ai-log">
            <summary>
              AI 작업 기록 · 도구 {steps.length}번 사용 (
              {steps.map((step) => step.name).join(" → ")})
            </summary>
            <ol>
              {steps.map((step) => (
                <li key={step.key}>
                  <b>{step.name}</b> · {step.reason} → {step.result}
                </li>
              ))}
            </ol>
          </details>
        </div>
      </div>

      <DeskModal
        open={confirmingApprove}
        onClose={() => setConfirmingApprove(false)}
        label="승인할까요?"
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>승인할까요?</h2>
        <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>
          승인하면 고칠 수 없어요.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="dbtn" onClick={() => setConfirmingApprove(false)}>
            취소
          </button>
          <button type="button" className="dbtn primary" onClick={approve}>
            <Icon name="check" />
            승인
          </button>
        </div>
      </DeskModal>
      <ReturnModal
        open={returning}
        record={record}
        error={returnError}
        busy={busy === "return"}
        onClose={() => {
          if (busy === "return") return;
          setReturning(false);
          setReturnError("");
        }}
        onReturn={(reason) => {
          if (busy) return;
          const next = returnRecord(db, record.id, reason, now());
          if ("error" in next) return;
          if (real) {
            // 관리자는 한국어 사유만 보낸다(결정 2026-10-28-되돌림사유한국어).
            // 실패하면 창 안에 이유를 남긴다(이슈 #114: 창이 그대로 있고 아무 반응이 없던 문제)
            setReturnError("");
            setBusy("return");
            void real.actions.returnRecord(record.id, reason).then((result) => {
              setBusy(null);
              if (!result.ok) return setReturnError(result.ko);
              setReturning(false);
              router.push("/review");
            });
            return;
          }
          demo.update(() => next);
          setReturning(false);
          router.push("/review");
        }}
      />
      {toast.node}
    </>
  );
}

function ReviewItem({
  record,
  item,
  selected,
  editable,
  onSelect,
  onEdit,
  onResolve,
  onCopy,
}: {
  record: DemoRecord;
  item: RecordItem;
  selected: boolean;
  editable: boolean;
  onSelect: () => void;
  onEdit: (value: string) => void;
  onResolve: (resolution: "confirmed_by_reviewer" | "omitted" | null, note: string) => boolean;
  onCopy: () => void;
}) {
  const [draft, setDraft] = useState(item.value_ko);
  const [omitting, setOmitting] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const label = itemLabel(item.item_key).ko;
  const names = useRoleNames();
  const unresolved = item.status === "needs_check" && item.resolution === null;
  const isNotes = item.item_key === "notes";
  const showMinutes = item.item_key === "support" && record.formType === "12";
  const minutes = (item.detail?.minutes ?? {}) as Record<string, number>;
  const total = supportMinutesTotal(record);
  const visit = visitMinutes(record);

  return (
    <article
      className={`panel ritem ${unresolved ? "warn" : ""} ${selected ? "sel" : ""}`}
      onClick={onSelect}
      aria-label={label}
    >
      <div className="ritem-head">
        <b>{label}</b>
        {itemChip(item, names)}
      </div>
      {item.status === "needs_check" && item.reason && item.source !== "reviewer" && (
        <p className="reason">
          <Icon name="alert" />
          {item.reason}
        </p>
      )}
      {/* 관리자가 고친 항목의 이유·근거는 고친 문장과 맞지 않을 수 있어 '지금 이유'처럼 보이지 않는다(이슈 #134).
          서버 PATCH는 value_ko만 바꾸고 reason·evidence는 그대로 둔다 */}
      {item.status === "needs_check" && item.reason && item.source === "reviewer" && (
        <details className="reason old" onClick={(event) => event.stopPropagation()}>
          <summary>고치기 전 AI 판단</summary>
          <p>{item.reason}</p>
        </details>
      )}
      <textarea
        className="field"
        aria-label={`${label} 내용`}
        rows={Math.max(1, Math.ceil(draft.length / 48))}
        value={draft}
        disabled={!editable || item.resolution === "omitted"}
        placeholder="언급 없음"
        maxLength={isNotes ? undefined : 500}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== item.value_ko) onEdit(draft);
        }}
      />
      {item.before_ko !== undefined && item.before_ko !== item.value_ko && (
        <p className="before">고치기 전: {item.before_ko || "(빈칸)"}</p>
      )}
      {showMinutes && (
        <div className="minutes" aria-label="지원별 제공시간">
          {supportMinuteKeys.map(({ key, ko }) => (
            <div key={key}>
              <span>{ko}</span>
              <b>{minutes[key] ? `${minutes[key]}분` : "–"}</b>
            </div>
          ))}
          <div className={visit !== null && total > visit ? "over" : ""}>
            <span>합 / 방문</span>
            <b>
              {total}분 / {visit ?? "–"}분
            </b>
          </div>
        </div>
      )}
      <div className="ritem-foot">
        <small>
          공식 기록지 칸: {formFieldHint[record.formType][item.item_key]}
          {isNotes && (
            <span className={draft.length > NOTES_LIMIT ? "warn-text" : ""}>
              {" "}
              · {draft.length}/{NOTES_LIMIT}자
            </span>
          )}
        </small>
        <div className="btns">
          {isNotes && item.value_ko && (
            <button
              type="button"
              className="dbtn sm"
              onClick={(event) => {
                event.stopPropagation();
                onCopy();
              }}
            >
              <Icon name="copy" />
              복사
            </button>
          )}
          {editable && unresolved && !omitting && (
            <>
              <button
                type="button"
                className="dbtn sm soft"
                onClick={(event) => {
                  event.stopPropagation();
                  if (draft !== item.value_ko) onEdit(draft);
                  onResolve("confirmed_by_reviewer", "");
                }}
              >
                <Icon name="check" />
                확인함
              </button>
              <button
                type="button"
                className="dbtn sm"
                onClick={(event) => {
                  event.stopPropagation();
                  setOmitting(true);
                }}
              >
                기록 안 함
              </button>
            </>
          )}
        </div>
      </div>
      {omitting && unresolved && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <label className="flabel" htmlFor={`omit-${item.item_key}`}>
            기록하지 않는 이유 (꼭 쓰기)
          </label>
          <input
            id={`omit-${item.item_key}`}
            className={`field ${noteError ? "invalid" : ""}`}
            value={note}
            maxLength={100}
            onChange={(event) => {
              setNote(event.target.value);
              setNoteError(false);
            }}
            placeholder="예: 원문만으로 판단할 수 없음"
          />
          {noteError && <p className="warn-text">이유를 써 주세요.</p>}
          <div className="btns" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="dbtn sm" onClick={() => setOmitting(false)}>
              취소
            </button>
            <button
              type="button"
              className="dbtn sm primary"
              onClick={() => {
                if (!onResolve("omitted", note)) {
                  setNoteError(true);
                  return;
                }
                setDraft("");
                setOmitting(false);
                setNote("");
              }}
            >
              기록 안 함으로 정하기
            </button>
          </div>
        </div>
      )}
      {item.status === "needs_check" && item.resolution !== null && (
        <p className="resolved">
          <Icon name="check" />
          {/* 누가·언제는 record_events의 resolved 줄에서 온다. 빈 값이면 구분점을 붙이지 않는다(이슈 #140) */}
          {[
            item.resolution === "omitted" ? "기록 안 함" : "확인함",
            item.resolved_by,
            item.resolved_at ? kstTime(item.resolved_at) : "",
            item.resolution === "omitted" ? item.resolution_note : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          {editable && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (item.resolution === "omitted") setDraft(item.before_ko ?? "");
                onResolve(null, "");
              }}
            >
              바꾸기
            </button>
          )}
        </p>
      )}
    </article>
  );
}

function ReturnModal({
  open,
  record,
  onClose,
  onReturn,
  error: serverError = "",
  busy = false,
}: {
  open: boolean;
  record: DemoRecord;
  onClose: () => void;
  onReturn: (reason: string) => void;
  /** 서버가 거절한 이유. 있으면 창 안에 보인다 */
  error?: string;
  /** 요청 중이면 [되돌리기]를 다시 누를 수 없다(이슈 #136) */
  busy?: boolean;
}) {
  const names = useRoleNames();
  const [keys, setKeys] = useState<ItemKey[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  const toggle = (key: ItemKey) =>
    setKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  return (
    <DeskModal open={open} onClose={onClose} label={`${names.worker}에게 되돌리기`}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{names.worker}에게 되돌리기</h2>
      <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>
        {names.worker}가 고쳐서 다시 전송해요.
      </p>
      <p className="flabel">다시 볼 항목 (고르면 사유 앞에 붙어요)</p>
      <div className="chips" style={{ marginBottom: 14 }}>
        {reviewOrder(record).map((item) => (
          <button
            key={item.item_key}
            type="button"
            className={keys.includes(item.item_key) ? "on" : ""}
            aria-pressed={keys.includes(item.item_key)}
            onClick={() => toggle(item.item_key)}
          >
            {itemLabel(item.item_key).ko}
          </button>
        ))}
      </div>
      <label className="flabel" htmlFor="return-reason">
        되돌리는 사유 (꼭 쓰기)
      </label>
      <textarea
        id="return-reason"
        className={`field ${error ? "invalid" : ""}`}
        rows={4}
        maxLength={RETURN_LIMIT}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setError(false);
        }}
        placeholder="예: 식사량이 ‘조금’이면 얼마나인지 다시 확인해 주세요."
      />
      <p className="fhint">
        {error ? (
          <span className="warn-text">사유를 써 주세요.</span>
        ) : (
          `${names.worker} 모국어로 번역해 함께 보여요.`
        )}{" "}
        <span style={{ float: "right" }}>
          {reason.length}/{RETURN_LIMIT}자
        </span>
      </p>
      {serverError && (
        <p className="warn-text" role="alert" style={{ margin: "0 0 8px" }}>
          되돌리지 못했어요. {serverError}
        </p>
      )}
      <p className="info-note">
        되돌리면 승인 대기에서 빠지고, {names.worker} 오늘 화면에 주황 띠로 보여요. {names.worker}가
        고친 항목은 {names.reviewer}가 다시 확인해요.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="dbtn" disabled={busy} onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="dbtn danger"
          disabled={busy}
          onClick={() => {
            if (!reason.trim()) {
              setError(true);
              return;
            }
            const prefix = keys.length
              ? `[${keys.map((key) => itemLabel(key).ko).join(", ")}] `
              : "";
            onReturn(`${prefix}${reason.trim()}`);
          }}
        >
          <Icon name="undo" />
          {busy ? "되돌리는 중" : "되돌리기"}
        </button>
      </div>
    </DeskModal>
  );
}
