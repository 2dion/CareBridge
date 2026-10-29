"use client";

// W3(기록 초안 확인): 정리 중 → 항목 카드 → 관리자에게 전송.
// 항목 내용·확인 이유·되돌림 사유와 제목·버튼은 병기, 상태 배지·항목 이름은 한국어만.
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { nowIso, useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel, Listen, Modal } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen, ResidentPill } from "@/components/mobile/shell";
import type { ItemStatus } from "@/lib/demo/state";
import {
  canSubmitRecord,
  confirmItem,
  type DemoDb,
  type DemoRecord,
  fillMockDraft,
  getResident,
  groupItems,
  itemLabel,
  markDraftFailed,
  retryDraft,
  type RecordItem,
  setFormField,
  submitRecord,
  supportMinutesTotal,
  timeRangeLabel,
  visitMinutes,
} from "@/lib/demo/store";

const NOTES_LIMIT = 200;

const statusBadge: Record<ItemStatus, { label: string; tone: string }> = {
  observed: { label: "관찰", tone: "green" },
  not_mentioned: { label: "언급 없음", tone: "gray" },
  needs_check: { label: "확인 필요", tone: "orange" },
};

const processingSteps = [
  { ko: "음성을 글자로 바꾸고 있어요.", vi: "Đang chuyển giọng nói thành văn bản." },
  { ko: "내용을 항목별로 정리하고 있어요.", vi: "Đang sắp xếp nội dung theo mục." },
  { ko: "확인할 곳을 찾고 있어요.", vi: "Đang tìm chỗ cần kiểm tra." },
];

export default function DraftPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const demo = useDemo();
  // 교육용 기관이면 '강사'(이슈 #125)
  const names = useRoleNames();
  const [step, setStep] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [retried, setRetried] = useState(false);

  const record = demo?.db.records[id];
  const processing = record?.draftState === "processing";
  const failDemo = search.get("demo") === "fail" && !retried;

  // 단계 표시. 실제 모드는 서버(받아쓰기·Agent)가 끝나면 공급자가 다시 읽어 바뀐다.
  // Mock 정리는 단계 표시 뒤 합성 사례 초안을 채운다(Supabase 설정이 없는 로컬 개발만).
  useEffect(() => {
    if (!processing || !demo) return;
    const timers = [
      window.setTimeout(() => setStep(1), 900),
      window.setTimeout(() => setStep(2), 1800),
    ];
    if (!demo.real) {
      timers.push(
        window.setTimeout(() => {
          demo.update((db) =>
            failDemo ? markDraftFailed(db, id, nowIso()) : fillMockDraft(db, id, nowIso()),
          );
          setStep(0);
        }, 2700),
      );
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // demo는 렌더마다 새 객체라 넣지 않는다. processing이 바뀔 때만 다시 시작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, id, failDemo]);

  const locked = record && (record.status === "submitted" || record.status === "approved");
  const empty = record?.draftState === "empty";
  // 방금 전송한 기록은 W3 · 전송 완료 화면으로 가고, 기록 보기로 돌리지 않는다.
  const justSent = useRef(false);
  useEffect(() => {
    if (locked && !justSent.current) router.replace(`/records/${id}/view`);
    else if (empty && record) router.replace(`/start/${record.residentId}?date=${record.careDate}`);
  }, [locked, empty, record, id, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!demo || !record || locked || empty) return <Loading tab="today" />;
  const resident = getResident(demo.db, record.residentId);
  if (!resident) return <Loading tab="today" />;

  if (record.draftState === "processing") {
    const steps = record.inputMode === "text" ? processingSteps.slice(1) : processingSteps;
    const current = Math.min(step, steps.length - 1);
    return (
      <MobileScreen tab="today">
        <AppBar title="정리 중" vi="Đang xử lý" />
        <ResidentPill resident={resident} date={record.careDate} />
        <div className="grow stack" style={{ justifyContent: "center" }}>
          <Art name="robot-processing" width={215} priority />
        </div>
        <section className="sheet card" style={{ marginBottom: 14, gap: 10 }} aria-live="polite">
          <h2 style={{ fontSize: 20 }}>AI가 기록 초안을 만들고 있어요.</h2>
          <span className="s-vi vi" style={{ marginTop: -8 }}>
            AI đang soạn bản nháp.
          </span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${((current + 1) / (steps.length + 1)) * 100}%` }}
            />
          </div>
          <div className="steps" style={{ marginTop: 6 }}>
            {steps.map((item, index) => (
              <div
                key={item.ko}
                className={`step ${index < current ? "done" : index === current ? "doing" : ""}`}
              >
                <span className="dot">
                  {index < current && <Icon name="check" />}
                  {index === current && <Icon name="refresh" />}
                </span>
                <div>
                  <b>{item.ko}</b>
                  <span className="vi">{item.vi}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </MobileScreen>
    );
  }

  if (record.draftState === "failed") {
    return (
      <MobileScreen tab="today">
        <AppBar title="기록 초안" vi="Bản nháp" back="/today" />
        <ResidentPill resident={resident} date={record.careDate} />
        <div className="grow stack" style={{ justifyContent: "center" }}>
          <Art name="robot-full" width={240} />
        </div>
        <section className="sheet card" style={{ marginBottom: 14 }} role="alert">
          <h2>초안을 만들지 못했어요</h2>
          <span className="s-vi vi">Không tạo được bản nháp.</span>
          <p>잠시 뒤 다시 시도하거나 글로 써 주세요. 쓴 글은 남아 있어요.</p>
          <span className="p-vi vi">
            Hãy thử lại sau hoặc viết trực tiếp. Nội dung đã viết vẫn còn.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setStep(0);
              setRetried(true);
              if (demo.real) {
                // 원문·입력 방법은 그대로 두고 저장된 원문으로 Agent를 다시 돌린다
                void demo.real.actions.retryDraft(id);
                return;
              }
              demo.update((db) => retryDraft(db, id, nowIso()));
              router.replace(`/records/${id}`);
            }}
          >
            <BtnLabel ko="다시 시도" vi="Thử lại" />
          </button>
          <Link className="btn btn-outline" href={`/records/${id}/write`}>
            <span className="label">글로 쓰기 · Viết trực tiếp</span>
          </Link>
        </section>
      </MobileScreen>
    );
  }

  const groups = groupItems(record.items);
  // 실제 모드는 DB 제출 검사와 같게 9개 모두 확인 또는 작성자가 고친 것이어야 전송한다(unconfirmed_items)
  const canSend =
    canSubmitRecord(record) &&
    (!demo.real ||
      (record.items.length === 9 &&
        record.items.every((item) => item.confirmed_by_worker || item.source === "worker")));
  const doneCount = groups.done.length;
  const total = record.items.length;
  const needsLeft = record.items.filter((item) => item.status === "needs_check").length;

  const real = demo.real;
  const act = (change: (db: DemoDb) => DemoDb) => demo.update(change);
  const confirm = (key: RecordItem["item_key"]) => {
    if (!real) return act((db) => confirmItem(db, id, key, nowIso()));
    void real.actions.patchItem(id, key, { confirmed_by_worker: true }).then((result) => {
      if (!result.ok) setToast(`${result.ko} ${result.vi}`);
    });
  };
  const setField = (key: "stool_accidents" | "urine_accidents", value: number | null) => {
    if (!real) return act((db) => setFormField(db, id, key, value, nowIso()));
    void real.actions.setFormFields(id, { ...record.formFields, [key]: value }).then((result) => {
      if (!result.ok) setToast(`${result.ko} ${result.vi}`);
    });
  };

  const send = async () => {
    if (real) {
      setConfirmOpen(false);
      justSent.current = true;
      const result = await real.actions.submit(id);
      if (!result.ok) {
        justSent.current = false;
        setToast(`${result.ko} ${result.vi}`);
        return;
      }
      router.push(`/records/${id}/sent`);
      return;
    }
    justSent.current = true;
    act((db) => submitRecord(db, id, nowIso()));
    setConfirmOpen(false);
    router.push(`/records/${id}/sent`);
  };

  return (
    <MobileScreen tab="today">
      <AppBar title="기록 초안 확인" vi="Kiểm tra bản nháp" back="/today" />
      <ResidentPill resident={resident} date={record.careDate} />
      <div className="scroll" style={{ marginTop: 12, paddingBottom: 12 }}>
        {record.status === "returned" && (
          <div className="reason-box big" role="note">
            <b>수정 요청 사유</b>
            {record.returnReason}
            {record.returnReasonNative && <span className="vi">{record.returnReasonNative}</span>}
            <span style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
              {record.returnedBy}
            </span>
          </div>
        )}
        {doneCount === total ? (
          <div className="done-bar card">
            <span className="check-dot solid">
              <Icon name="check" />
            </span>
            <b>모두 확인했어요</b>
            <span className="badge badge-green">{total}개</span>
            <span className="grow" />
            <span className="done-note">확인 필요 {needsLeft}개</span>
          </div>
        ) : (
          <div className="done-bar card">
            <b>
              {total}개 중 {doneCount}개 확인
            </b>
            <span className="grow" />
            <span className="done-note">남은 항목 {total - doneCount}개</span>
          </div>
        )}
        {resident.careType === "home" && <HomeCareCard record={record} setField={setField} />}
        <ItemGroup
          title="먼저 확인할 항목"
          color="var(--color-warn)"
          tone="orange"
          items={groups.needsCheck}
          record={record}
          onConfirm={confirm}
        />
        <ItemGroup
          title="아직 확인하지 않은 항목"
          color="var(--color-highlight)"
          tone="green"
          items={groups.pending}
          record={record}
          onConfirm={confirm}
        />
        <ItemGroup
          title="확인한 항목"
          color="var(--color-primary)"
          tone="green"
          items={groups.done}
          record={record}
          onConfirm={confirm}
        />
        {needsLeft > 0 && (
          <p className="foot-note">
            ‘확인 필요’가 남아 있어도 보낼 수 있어요. {names.reviewer}가 정해요.
            <span className="vi">
              Vẫn gửi được khi còn mục cần kiểm tra. {names.reviewerVi} sẽ quyết định.
            </span>
          </p>
        )}
      </div>
      <div className="action-panel card sticky-actions">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => {
            setToast("임시 저장했어요.");
            window.setTimeout(() => router.push("/today"), 700);
          }}
        >
          <BtnLabel ko="임시 저장" vi="Lưu tạm" />
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!canSend}
          onClick={() => setConfirmOpen(true)}
        >
          <BtnLabel ko={`${names.reviewer}에게 전송`} vi={`Gửi ${names.reviewerVi}`} />
        </button>
      </div>
      {!canSend && (
        <p className="sr-only" role="status">
          모든 항목을 확인하면 보낼 수 있어요.
        </p>
      )}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        label={`${names.reviewer}에게 전송할까요?`}
      >
        <span className="icon-bubble" style={{ width: 64, height: 64, borderRadius: 32 }}>
          <Icon name="send" />
        </span>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{names.reviewer}에게 전송할까요?</h2>
        <hr style={{ width: "100%" }} />
        <p style={{ fontSize: 17 }}>전송한 뒤에는 고칠 수 없어요.</p>
        <span className="vi" style={{ fontSize: 13, marginTop: -6 }}>
          Sau khi gửi, bạn không thể chỉnh sửa.
        </span>
        <div className="btn-row" style={{ width: "100%", marginTop: 6 }}>
          <button type="button" className="btn btn-outline" onClick={() => setConfirmOpen(false)}>
            <BtnLabel ko="취소" vi="Hủy" />
          </button>
          <button type="button" className="btn btn-primary" onClick={send}>
            <BtnLabel ko="전송" vi="Gửi" />
          </button>
        </div>
      </Modal>
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </MobileScreen>
  );
}

function ItemGroup({
  title,
  color,
  tone,
  items,
  record,
  onConfirm,
}: {
  title: string;
  color: string;
  tone: string;
  items: RecordItem[];
  record: DemoRecord;
  onConfirm: (key: RecordItem["item_key"]) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="sec-label">
        <span className="dot" style={{ background: color }} />
        {title}
        <span className={`badge badge-${tone}`}>{items.length}개</span>
      </div>
      {items.map((item) => (
        <ItemCard key={item.item_key} item={item} record={record} onConfirm={onConfirm} />
      ))}
    </>
  );
}

function ItemCard({
  item,
  record,
  onConfirm,
}: {
  item: RecordItem;
  record: DemoRecord;
  onConfirm: (key: RecordItem["item_key"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const names = useRoleNames();
  const label = itemLabel(item.item_key);
  const done = item.confirmed_by_worker || item.source === "worker";
  const editHref = `/records/${record.id}/items/${item.item_key}`;
  const badge = done
    ? { label: item.source === "worker" ? "고침" : "확인 완료", tone: "green" }
    : statusBadge[item.status];
  const notesLength = item.item_key === "notes" ? [...item.value_ko].length : 0;

  return (
    <article
      className={`review card ${done ? "done" : item.status === "needs_check" ? "warn" : ""}`}
    >
      <div className="review-head">
        {done && (
          <span className="check-dot">
            <Icon name="check" />
          </span>
        )}
        <b>{label.ko}</b>
        {item.source === "ai" && !item.confirmed_by_worker && item.status !== "not_mentioned" && (
          <span className="ai-mark">AI 초안</span>
        )}
        {done && item.status === "needs_check" && (
          <span className="badge badge-orange">확인 필요</span>
        )}
        <span className={`badge badge-${badge.tone}`}>{badge.label}</span>
      </div>
      {item.status === "not_mentioned" && !item.value_ko ? (
        <>
          <p>말한 내용에 없어요.</p>
          <span className="vi">Không có trong lời kể.</span>
        </>
      ) : (
        <>
          <div className="ko-line">
            <p>{item.value_ko}</p>
            <Listen text={item.value_ko} />
          </div>
          {item.value_native && <span className="vi">{item.value_native}</span>}
        </>
      )}
      {item.before_ko && item.source === "reviewer" && (
        <p className="before" aria-label={`${names.reviewer}가 고치기 전`}>
          고치기 전: {item.before_ko}
        </p>
      )}
      {item.source === "reviewer" && !item.confirmed_by_worker && (
        <span style={{ fontSize: 12, color: "var(--color-warn-text)" }}>
          {names.reviewer}가 고쳤어요. 맞는지 확인해 주세요.
          <span className="vi" style={{ display: "block" }}>
            {names.reviewerVi} đã sửa. Hãy kiểm tra lại.
          </span>
        </span>
      )}
      {item.status === "needs_check" && item.reason && (
        <div className="reason-box">
          확인 이유 · {item.reason}
          {item.reason_native && (
            <span className="vi" style={{ display: "block" }}>
              {item.reason_native}
            </span>
          )}
        </div>
      )}
      {item.item_key === "notes" && notesLength > 0 && (
        <p className={`counter ${notesLength > NOTES_LIMIT ? "over" : ""}`}>
          {notesLength}/{NOTES_LIMIT}
          {notesLength > NOTES_LIMIT && " · 200자를 넘었어요. 보낼 수는 있어요."}
        </p>
      )}
      {item.evidence && (
        <>
          <button
            type="button"
            className="text-link"
            style={{ textAlign: "left", marginTop: 4 }}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "내가 한 말 접기" : "내가 한 말 보기"}
          </button>
          {open && (
            <div className="said-box">
              <b>내가 한 말</b>
              {item.evidence}
            </div>
          )}
        </>
      )}
      {!done &&
        (item.status === "needs_check" ? (
          // 전송은 9개 항목이 모두 확인(맞아요)되거나 작성자가 고친 것이어야 한다(DB 제출 검사, 10/28).
          // ‘확인 필요’도 [맞아요]로 확인하고 보낼 수 있고, 남은 판단은 관리자가 한다.
          <div className="btn-row">
            <Link className="btn btn-primary btn-sm" href={editHref}>
              <BtnLabel ko="수정하기" vi="Sửa" />
            </Link>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onConfirm(item.item_key)}
            >
              <BtnLabel ko="맞아요" vi="Đúng" />
            </button>
          </div>
        ) : item.status === "not_mentioned" ? (
          <div className="btn-row">
            <Link className="btn btn-primary btn-sm" href={editHref}>
              <BtnLabel ko="보태기" vi="Bổ sung" />
            </Link>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onConfirm(item.item_key)}
            >
              <BtnLabel ko="없음이 맞아요" vi="Đúng là không có" />
            </button>
          </div>
        ) : (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onConfirm(item.item_key)}
            >
              <BtnLabel ko="맞아요" vi="Đúng" />
            </button>
            <Link className="btn btn-outline btn-sm" href={editHref}>
              <BtnLabel ko="달라요" vi="Không đúng" />
            </Link>
          </div>
        ))}
      {done && (
        <Link className="text-link" href={editHref} style={{ textAlign: "left", marginTop: 6 }}>
          다시 고치기
        </Link>
      )}
    </article>
  );
}

/** 재가(별지 제12호) 칸: 방문 시작·종료, 지원별 분 합, 배변 실수 2칸(화면 v1.3 W3 재가). */
function HomeCareCard({
  record,
  setField,
}: {
  record: DemoRecord;
  setField: (key: "stool_accidents" | "urine_accidents", value: number | null) => void;
}) {
  const visit = record.items.find((item) => item.item_key === "visit_time")?.detail;
  const range =
    typeof visit?.start === "string" && typeof visit?.end === "string"
      ? `${visit.start}~${visit.end}`
      : null;
  const minutes = visitMinutes(record);
  const totalMinutes = supportMinutesTotal(record);
  const editable = record.status === "draft" || record.status === "returned";
  const field = (key: "stool_accidents" | "urine_accidents", label: string) => (
    <label key={key} style={{ display: "contents" }}>
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={20}
        disabled={!editable}
        value={record.formFields?.[key] ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          const value = raw === "" ? null : Math.max(0, Math.min(20, Math.trunc(Number(raw))));
          setField(key, value);
        }}
      />
    </label>
  );
  return (
    <section className="review card">
      <div className="review-head">
        <b>재가 서식 칸</b>
        <span className="badge badge-gray">별지 제12호</span>
      </div>
      <div className="detail-row">
        <span className="k">방문 시간</span>
        <span className="v">
          {range ? `${timeRangeLabel(range)}${minutes ? ` (${minutes}분)` : ""}` : "아직 없어요"}
        </span>
      </div>
      <div className="detail-row">
        <span className="k">지원별 제공시간 합</span>
        <span
          className="v"
          style={
            minutes !== null && totalMinutes > minutes
              ? { color: "var(--color-warn-text)" }
              : undefined
          }
        >
          {totalMinutes}분
        </span>
      </div>
      <div className="minutes-grid" style={{ marginTop: 10 }}>
        {field("stool_accidents", "대변 실수 횟수")}
        {field("urine_accidents", "소변 실수 횟수")}
      </div>
      <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 6 }}>
        방문 시간과 지원별 분은 아래 ‘방문 시점’·‘제공 지원’ 카드에서 고쳐요. 기저귀를 쓰면 교환
        횟수를 적어요.
      </p>
    </section>
  );
}
