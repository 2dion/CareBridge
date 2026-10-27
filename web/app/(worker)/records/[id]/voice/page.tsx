"use client";

// W2(음성 메모, 피그마 M07~M09): 준비 → 녹음 → 정지하면 바로 보냄 → W3 ‘정리 중’.
// 녹음은 탭 메모리에만 두고, 보내지 못하면 [다시 보내기](2026-10-27-녹음임시보관 결정).
// 녹음 화면 안내는 내가 말하는 곳이라 한국어만(병기 원칙 ①), 마이크 권한·오류 안내는 병기(②).
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { nowIso, useDemo } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel, Modal } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen, ResidentPill } from "@/components/mobile/shell";
import { clock, MAX_SECONDS, useRecorder } from "@/components/mobile/use-recorder";
import { getResident, markProcessing } from "@/lib/demo/store";

type SendState = "idle" | "sending" | "offline";

export default function VoicePage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const demo = useDemo();
  const recorder = useRecorder();
  const [send, setSend] = useState<SendState>("idle");
  const [leaving, setLeaving] = useState(false);

  const record = demo?.db.records[id];
  const locked = record && record.status !== "draft" && record.status !== "returned";
  useEffect(() => {
    if (locked) router.replace(`/records/${id}/view`);
  }, [locked, id, router]);

  const upload = () => {
    if (!demo) return;
    setSend("sending");
    // Mock: 실제로는 upload-url → Storage 올리기 → /audio. 지금은 연결 상태만 본다.
    window.setTimeout(() => {
      if (!navigator.onLine || search.get("demo") === "offline") {
        setSend("offline");
        return;
      }
      demo.update((db) => markProcessing(db, id, null, nowIso()));
      recorder.discard();
      const fail = search.get("demo") === "fail" ? "?demo=fail" : "";
      router.replace(`/records/${id}${fail}`);
    }, 700);
  };

  // 정지(직접 또는 5분 자동)하면 바로 처리를 시작한다(화면 v1.3 W2).
  const stopped = recorder.state === "stopped";
  useEffect(() => {
    if (!stopped || send !== "idle") return;
    const frame = window.requestAnimationFrame(upload);
    return () => window.cancelAnimationFrame(frame);
    // upload는 매번 새로 만들어지지만 정지 순간 한 번만 부르면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopped, send]);

  if (!demo || !record) return <Loading tab="today" />;
  const resident = getResident(demo.db, record.residentId);
  if (!resident) return <Loading tab="today" />;
  const pastDate = record.careDate !== demo.today;
  const writeHref = `/records/${id}/write`;

  const dateLine = pastDate && (
    <p className="center" style={{ marginTop: 10, fontSize: 20, fontWeight: 700 }}>
      {Number(record.careDate.slice(5, 7))}월 {Number(record.careDate.slice(8, 10))}일 기록
    </p>
  );

  if (recorder.state === "denied" || recorder.state === "unsupported") {
    return (
      <MobileScreen tab="today">
        <AppBar
          title="기록 시작"
          vi="Bắt đầu ghi chép"
          back={`/start/${resident.id}?date=${record.careDate}`}
        />
        <ResidentPill resident={resident} date={record.careDate} />
        <div className="grow stack" style={{ justifyContent: "center" }}>
          <Art name="robot-mic-off" width={215} />
        </div>
        <section className="sheet card" style={{ marginBottom: 14 }} role="alert">
          {recorder.state === "denied" ? (
            <>
              <h2>마이크 권한이 필요해요</h2>
              <span className="s-vi vi">Cần cấp quyền truy cập micrô</span>
              <p>
                녹음하려면 휴대폰 설정에서
                <br />
                마이크 사용을 허용해 주세요.
              </p>
              <span className="p-vi vi">Hãy cho phép dùng micrô trong phần cài đặt.</span>
            </>
          ) : (
            <>
              <h2>이 브라우저는 녹음을 못 해요</h2>
              <span className="s-vi vi">Trình duyệt này không ghi âm được.</span>
              <p>다른 브라우저로 열거나 글로 써 주세요.</p>
              <span className="p-vi vi">Hãy mở bằng trình duyệt khác hoặc viết trực tiếp.</span>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={() => recorder.start()}>
            <span className="label">다시 시도 · Thử lại</span>
          </button>
          <Link className="btn btn-outline" href={writeHref}>
            <span className="label">글로 쓰기 · Viết trực tiếp</span>
          </Link>
        </section>
      </MobileScreen>
    );
  }

  if (recorder.state === "recording" || recorder.state === "stopped") {
    const left = Math.max(0, MAX_SECONDS - recorder.seconds);
    return (
      <MobileScreen>
        <AppBar
          title={stopped ? "보내는 중" : "녹음 중"}
          vi={stopped ? "Đang gửi" : "Đang ghi âm"}
          right={
            send !== "sending" && (
              <button type="button" className="text-link" onClick={() => setLeaving(true)}>
                나가기
              </button>
            )
          }
        />
        <ResidentPill resident={resident} date={record.careDate} />
        {dateLine}
        <section className="hero" style={{ marginTop: 16 }}>
          <h1 style={{ fontSize: 27 }}>
            지금 돌봄 내용을
            <br />
            <em>말해</em> 주세요.
          </h1>
        </section>
        <div className="grow stack" style={{ justifyContent: "center" }}>
          <Art name="robot-recording" width={300} priority />
        </div>
        <p className="timer" aria-live="off">
          {!stopped && <span className="rec-dot" aria-hidden="true" />}
          {clock(recorder.seconds)}
        </p>
        <p className="center" style={{ marginTop: 6, fontSize: 15, color: "var(--color-sub)" }}>
          {stopped
            ? "녹음을 보내고 있어요."
            : `남은 시간 ${clock(left)} · 5분이 되면 자동으로 멈춰요.`}
        </p>
        {send === "offline" && (
          <div className="reason-box" role="alert" style={{ margin: "12px 16px 0" }}>
            <b>인터넷 연결을 확인하세요.</b>
            <span className="vi">Hãy kiểm tra kết nối Internet.</span>
            <p style={{ marginTop: 4, fontSize: 13 }}>
              녹음은 이 화면에 남아 있어요. 다시 녹음하지 않아도 돼요.
            </p>
            <span className="vi">Bản ghi âm vẫn còn, không cần ghi lại.</span>
          </div>
        )}
        <div className="stack pad" style={{ gap: 10, marginTop: 16 }}>
          {!stopped ? (
            <button type="button" className="btn btn-primary btn-center" onClick={recorder.stop}>
              <Icon name="stop" />
              <BtnLabel ko="정지" vi="Dừng" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-center"
              onClick={upload}
              disabled={send === "sending"}
            >
              <Icon name="send" />
              <BtnLabel ko={send === "sending" ? "보내는 중" : "다시 보내기"} vi="Gửi lại" />
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-center"
            onClick={() => {
              // 지금 녹음을 버리고 바로 새로 녹음한다(10/27 팀장: [삭제] → [다시 시도]).
              recorder.discard();
              setSend("idle");
              void recorder.start();
            }}
            disabled={send === "sending"}
          >
            <Icon name="refresh" />
            <BtnLabel ko="다시 시도" vi="Thử lại" />
          </button>
        </div>
        <div className="link-row" style={{ margin: "16px 0 22px" }}>
          <Link className="on" href={writeHref} onClick={() => recorder.discard()}>
            글로 쓰기
          </Link>
        </div>
        <Modal open={leaving} onClose={() => setLeaving(false)} label="녹음을 버리고 나갈까요?">
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>녹음을 버리고 나갈까요?</h2>
          <span className="vi" style={{ fontSize: 13 }}>
            Bỏ bản ghi âm và thoát?
          </span>
          <p style={{ fontSize: 16 }}>지금까지 말한 내용은 저장되지 않아요.</p>
          <span className="vi" style={{ fontSize: 13, marginTop: -6 }}>
            Nội dung đã nói sẽ không được lưu.
          </span>
          <div className="btn-row" style={{ width: "100%", marginTop: 6 }}>
            <button type="button" className="btn btn-outline" onClick={() => setLeaving(false)}>
              <BtnLabel ko="계속하기" vi="Tiếp tục" />
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                recorder.discard();
                router.replace(`/start/${resident.id}?date=${record.careDate}`);
              }}
            >
              <BtnLabel ko="나가기" vi="Thoát" />
            </button>
          </div>
        </Modal>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen tab="today">
      <AppBar
        title="기록 시작"
        vi="Bắt đầu ghi chép"
        back={`/start/${resident.id}?date=${record.careDate}`}
      />
      <ResidentPill resident={resident} date={record.careDate} />
      {dateLine}
      <div className="grow stack" style={{ justifyContent: "center" }}>
        <Art name="robot-ready" width={205} priority />
      </div>
      <section className="sheet card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 20 }}>준비되면 녹음을 시작해 주세요.</h2>
        <div className="hint-list">
          <div className="hint">
            <span className="icon-bubble sm">
              <Icon name="mic" />
            </span>
            <div>
              <b>
                오늘 도운 일, 식사, 수면, 달라진 점을
                <br />
                편하게 말해 주세요.
              </b>
            </div>
          </div>
          <div className="hint">
            <span className="icon-bubble sm">
              <Icon name="doc" />
            </span>
            <div>
              <b>
                AI가 항목별 초안을 만들고,
                <br />
                확인할 곳을 알려 드려요.
              </b>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-center"
          onClick={() => recorder.start()}
          disabled={recorder.state === "asking"}
        >
          <Icon name="mic" />
          <BtnLabel
            ko={recorder.state === "asking" ? "마이크 확인 중" : "녹음 시작"}
            vi="Bắt đầu ghi âm"
          />
        </button>
        <Link className="btn btn-outline btn-center btn-sm" href={writeHref}>
          <Icon name="pencil" />
          <BtnLabel ko="글로 쓰기" vi="Viết trực tiếp" />
        </Link>
      </section>
    </MobileScreen>
  );
}
