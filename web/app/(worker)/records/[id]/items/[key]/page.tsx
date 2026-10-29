"use client";

// W3 · 항목 고치기·보태기(수정, 언급 없음 보충).
// 한국어·베트남어 어느 쪽으로 써도 되고, 실제로는 서버가 이 항목만 한국어 기록체로 다시 쓰고 번역한다(화면 v1.3 W3).
import { useParams, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

import { nowIso, useDemo } from "@/components/demo/demo-provider";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen, ResidentPill } from "@/components/mobile/shell";
import { clock, useRecorder } from "@/components/mobile/use-recorder";
import type { ItemKey } from "@/lib/demo/state";
import {
  getResident,
  itemLabel,
  mockVoiceAddition,
  supportMinuteKeys,
  workerEditItem,
} from "@/lib/demo/store";

const examples: Partial<Record<ItemKey, { ko: string; vi: string }>> = {
  visit_time: { ko: "“두 시부터 다섯 시까지 있었어요.”", vi: "“Tôi ở từ 2 giờ đến 5 giờ.”" },
  support: { ko: "“목욕을 도와드렸어요.”", vi: "“Tôi đã giúp bác tắm.”" },
  meal: { ko: "“점심을 절반 정도 드셨어요.”", vi: "“Bác ăn khoảng một nửa bữa trưa.”" },
  sleep: { ko: "“밤에 자주 깨셨어요.”", vi: "“Đêm qua bác thường xuyên thức giấc.”" },
  discomfort: { ko: "“무릎이 아프다고 하셨어요.”", vi: "“Bác nói đau đầu gối.”" },
  cognition: {
    ko: "“어제보다 날짜를 더 자주 물으셨어요.”",
    vi: "“Bác hỏi ngày nhiều hơn hôm qua.”",
  },
  medication: { ko: "“점심 약을 드시는 걸 봤어요.”", vi: "“Tôi thấy bác uống thuốc buổi trưa.”" },
  notes: { ko: "“오후에 가족이 면회 왔어요.”", vi: "“Buổi chiều gia đình đến thăm.”" },
  next_check: { ko: "“내일 식사량을 다시 봐 주세요.”", vi: "“Ngày mai hãy xem lại lượng ăn.”" },
};

export default function ItemEditPage() {
  const { id, key } = useParams<{ id: string; key: ItemKey }>();
  const router = useRouter();
  const demo = useDemo();
  const recorder = useRecorder();
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState<Record<string, string> | null>(null);
  const [times, setTimes] = useState<{ start: string; end: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const status = demo?.db.records[id]?.status;
  const locked = status === "submitted" || status === "approved";
  useEffect(() => {
    if (locked) router.replace(`/records/${id}/view`);
  }, [locked, id, router]);

  if (!demo || locked) return <Loading tab="today" />;
  const record = demo.db.records[id];
  const item = record?.items.find((entry) => entry.item_key === key);
  const resident = record && getResident(demo.db, record.residentId);
  if (!record || !item || !resident) return <Loading tab="today" />;
  const back = `/records/${id}`;

  const label = itemLabel(key);
  const missing = item.status === "not_mentioned" && !item.value_ko;
  const home = record.formType === "12";
  const detailMinutes = (item.detail?.minutes ?? {}) as Record<string, number>;
  const minuteValues =
    minutes ??
    Object.fromEntries(
      supportMinuteKeys.map(({ key: k }) => [k, detailMinutes[k] ? String(detailMinutes[k]) : ""]),
    );
  const timeValues = times ?? {
    start: typeof item.detail?.start === "string" ? item.detail.start : "",
    end: typeof item.detail?.end === "string" ? item.detail.end : "",
  };
  const showMinutes = home && key === "support";
  const showTimes = home && key === "visit_time";
  const changedDetail = minutes !== null || times !== null;
  const canApply = !busy && (text.trim().length > 0 || changedDetail);

  const apply = () => {
    if (!canApply) return;
    let detail = item.detail;
    if (showMinutes && minutes) {
      const parsed = Object.fromEntries(
        Object.entries(minutes)
          .map(([k, v]) => [k, Math.max(0, Math.trunc(Number(v) || 0))] as const)
          .filter(([, v]) => v > 0),
      );
      detail = { ...item.detail, minutes: parsed };
    }
    if (showTimes && times) detail = { ...item.detail, start: times.start, end: times.end };
    const value =
      text.trim() ||
      (showTimes && times?.start && times.end ? `${times.start}~${times.end} 방문` : item.value_ko);
    if (demo.real) {
      const real = demo.real;
      void (async () => {
        // 방문 시작·종료는 records.visit_start·visit_end에 둔다
        if (showTimes && times) {
          const saved = await real.actions.setVisitTime(id, times.start, times.end);
          if (!saved.ok) return setNotice(`${saved.ko} ${saved.vi}`);
        }
        const rest = Object.fromEntries(
          Object.entries(detail ?? {}).filter(([k]) => k !== "start" && k !== "end"),
        );
        // 글로 쓴 고칠 내용은 음성 보태기와 같이 AI가 그 항목만 다시 정리·번역한다(이슈 #118).
        // 한국어·베트남어 어느 쪽으로 써도 공식 기록 칸은 한국어 기록체가 된다.
        if (text.trim()) {
          setBusy(true);
          setNotice("정리하고 번역하는 중이에요. · Đang sắp xếp và dịch.");
          const rewritten = await real.actions.rewriteItemText(id, key, text.trim());
          if (!rewritten.ok) {
            setBusy(false);
            return setNotice(`${rewritten.ko} ${rewritten.vi}`);
          }
          // 지원별 분을 같이 고쳤으면 AI 결과 뒤에 덮어써서 직접 넣은 분이 남게 한다
          if (showMinutes && minutes) {
            const saved = await real.actions.patchItem(id, key, { detail: rest });
            if (!saved.ok) {
              setBusy(false);
              return setNotice(`${saved.ko} ${saved.vi}`);
            }
          }
          router.push(back);
          return;
        }
        // 시간·분만 고쳤으면 value_ko는 바뀐 때만 보낸다(그대로인 값을 다시 보내지 않음)
        const result = await real.actions.patchItem(id, key, {
          ...(value !== item.value_ko ? { value_ko: value } : {}),
          ...(detail ? { detail: rest } : {}),
          confirmed_by_worker: true,
        });
        if (!result.ok) return setNotice(`${result.ko} ${result.vi}`);
        router.push(back);
      })();
      return;
    }
    demo.update((db) => workerEditItem(db, id, key, { value_ko: value, detail }, nowIso()));
    router.push(back);
  };

  const voiceAdd = async () => {
    if (recorder.state === "recording" && demo.real) {
      recorder.stop();
      let blob = recorder.blob();
      for (let wait = 0; !blob && wait < 20; wait++) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        blob = recorder.blob();
      }
      if (!blob) return setNotice("녹음을 찾지 못했어요. 다시 말해 주세요.");
      setNotice("올리는 중이에요. · Đang tải lên.");
      // 이 항목만 다시 쓴다(③ 항목 보태기, save_ai_item item)
      const result = await demo.real.actions.sendItemVoice(id, key, blob);
      if (!result.ok) return setNotice(`${result.ko} ${result.vi}`);
      recorder.discard();
      router.push(back);
      return;
    }
    if (recorder.state === "recording") {
      recorder.stop();
      const next = mockVoiceAddition(demo.db, id, key, nowIso());
      recorder.discard();
      if (next) {
        demo.update(() => next);
        router.push(back);
      } else {
        setNotice("시연(Mock)에서는 이 항목의 말하기 결과가 없어요. 글로 적어 주세요.");
      }
      return;
    }
    setNotice("");
    recorder.start();
  };

  return (
    <MobileScreen tab="today">
      <AppBar
        title={missing ? "내용 보태기" : "항목 고치기"}
        vi={missing ? "Bổ sung" : "Sửa mục"}
        back={back}
      />
      <ResidentPill resident={resident} date={record.careDate} />
      <div className="scroll" style={{ marginTop: 12, paddingBottom: 12 }}>
        <div className="item-title">
          <span
            className="vbar"
            style={{
              background:
                item.status === "needs_check" ? "#f0b062" : missing ? "#9fb8aa" : "#6fb58c",
            }}
          />
          <b>{label.ko}</b>
          <span
            className={`badge ${item.status === "needs_check" ? "badge-orange" : missing ? "badge-gray" : "badge-green"}`}
          >
            {item.status === "needs_check" ? "확인 필요" : missing ? "언급 없음" : "관찰"}
          </span>
        </div>
        {item.status === "needs_check" && item.reason && (
          <div className="reason-box big">
            <b>확인 이유</b>
            {item.reason}
          </div>
        )}
        {missing ? (
          <>
            <section className="review card">
              <div className="review-head">
                <div>
                  <b>아직 {label.ko} 내용이 기록되지 않았어요.</b>
                  <span className="vi" style={{ display: "block", fontSize: 12 }}>
                    Chưa có nội dung về mục này.
                  </span>
                </div>
              </div>
              <p style={{ fontSize: 13 }}>기억나는 내용이 있다면 보충해 주세요.</p>
              <span className="vi">Nếu nhớ, hãy bổ sung thông tin.</span>
            </section>
            {examples[key] && (
              <div className="said-box">
                <span className="badge badge-green">예시 문장</span>
                <b style={{ fontSize: 17, color: "var(--color-text)", marginTop: 6 }}>
                  {examples[key].ko}
                </b>
                <span className="vi">{examples[key].vi}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <section className="review card">
              <div className="review-head">
                <span className="icon-bubble sm round">
                  <Icon name="doc" />
                </span>
                <b>{item.source === "ai" ? "AI가 정리한 내용" : "지금 내용"}</b>
              </div>
              <p>{item.value_ko}</p>
              {item.value_native && <span className="vi">{item.value_native}</span>}
            </section>
            {item.evidence && (
              <div className="said-box">
                <b>내가 한 말</b>
                {item.evidence}
              </div>
            )}
          </>
        )}
        {showTimes && (
          <section className="review card">
            <div className="review-head">
              <b>방문 시작·종료</b>
            </div>
            <div className="minutes-grid times">
              <label htmlFor="visit-start">시작</label>
              <input
                id="visit-start"
                type="time"
                value={timeValues.start}
                onChange={(event) => setTimes({ ...timeValues, start: event.target.value })}
              />
              <label htmlFor="visit-end">종료</label>
              <input
                id="visit-end"
                type="time"
                value={timeValues.end}
                onChange={(event) => setTimes({ ...timeValues, end: event.target.value })}
              />
            </div>
          </section>
        )}
        {showMinutes && (
          <section className="review card">
            <div className="review-head">
              <b>지원별 제공시간(분)</b>
            </div>
            <div className="minutes-grid">
              {/* label을 htmlFor로 잇는다. display: contents로 감싸면 Chrome 접근성 트리에서 이름이 빠진다(이슈 #139) */}
              {supportMinuteKeys.map(({ key: k, ko }) => (
                <Fragment key={k}>
                  <label htmlFor={`minutes-${k}`}>{ko}</label>
                  <input
                    id={`minutes-${k}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={minuteValues[k]}
                    onChange={(event) => setMinutes({ ...minuteValues, [k]: event.target.value })}
                  />
                </Fragment>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 6 }}>
              합이 방문 시간보다 길면 ‘확인 필요’로 표시돼요. 그래도 보낼 수 있어요.
            </p>
          </section>
        )}
        <section className="review card grow">
          <div className="review-head">
            <label htmlFor="item-text" style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>
              {missing ? "보충할 내용" : "고칠 내용"}
            </label>
          </div>
          <textarea
            id="item-text"
            className="input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`${missing ? `${label.ko} 상태를 자유롭게` : "고칠 내용을"} 적어 주세요. (한국어 또는 베트남어)`}
          />
          <div className="note-line" style={{ marginTop: 8 }}>
            <Icon name="refresh" />
            <span>이 항목만 다시 정리하고 번역해요.</span>
          </div>
        </section>
        {recorder.state === "recording" && (
          <p className="center" role="status" style={{ fontWeight: 700 }}>
            <span className="rec-dot" aria-hidden="true" />
            말하는 중 {clock(recorder.seconds)} · 끝나면 [말하기 끝]을 눌러요.
          </p>
        )}
        {(recorder.state === "denied" || recorder.state === "unsupported") && (
          <div className="reason-box" role="alert">
            <b>마이크를 쓸 수 없어요. 글로 적어 주세요.</b>
            <span className="vi" style={{ display: "block" }}>
              Không dùng được micrô. Hãy viết trực tiếp.
            </span>
          </div>
        )}
        {notice && (
          <div className="reason-box" role="status">
            {notice}
          </div>
        )}
      </div>
      <div className="action-panel card sticky-actions">
        <button type="button" className="btn btn-outline btn-center btn-sm" onClick={voiceAdd}>
          <Icon name={recorder.state === "recording" ? "stop" : "mic"} />
          <BtnLabel
            ko={
              recorder.state === "recording" ? "말하기 끝" : missing ? "말로 보충" : "다시 말하기"
            }
            vi="Nói lại"
          />
        </button>
        <button type="button" className="btn btn-primary" disabled={!canApply} onClick={apply}>
          <BtnLabel ko={missing ? "내용 적용" : "수정 내용 적용"} vi="Áp dụng" />
        </button>
      </div>
    </MobileScreen>
  );
}
