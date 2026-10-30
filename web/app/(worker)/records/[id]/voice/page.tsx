"use client";

// W2 · 녹음: 준비 → 녹음 → 정지하면 바로 올림 → W3 ‘정리 중’.
// 녹음은 탭 메모리에만 두고, 올리지 못하면 [다시 올리기](2026-10-27-녹음임시보관 결정).
// 말하기·글쓰기는 기록 시작 화면에서 하나만 고른다(10/27 팀장). 여기서 글쓰기로 넘어가는 길은 마이크를 못 쓸 때만.
// 앱이 제공하는 녹음 안내는 한국어·베트남어 병기(#102). 작성자가 말한 원문은 번역하지 않는다.
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
  const [sendError, setSendError] = useState<{ ko: string; vi: string } | null>(null);

  const record = demo?.db.records[id];
  const locked = record && record.status !== "draft" && record.status !== "returned";
  useEffect(() => {
    if (locked) router.replace(`/records/${id}/view`);
  }, [locked, id, router]);

  const upload = async () => {
    if (!demo) return;
    setSend("sending");
    if (demo.real) {
      // upload-url → Storage에 바로 올리기 → /audio(받아쓰기 뒤 Agent는 서버가 뒤에서 돌림)
      // 녹음이 정지 직후 아직 묶이지 않았으면 잠깐 기다린다(onstop)
      let blob = recorder.blob();
      for (let wait = 0; !blob && wait < 20; wait++) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        blob = recorder.blob();
      }
      if (!blob || !navigator.onLine) {
        setSend("offline");
        return;
      }
      const result = await demo.real.actions.sendVoice(id, blob);
      if (!result.ok) {
        setSendError(result.error === "network" ? null : { ko: result.ko, vi: result.vi });
        // 녹음은 메모리에 남아 있어 [다시 올리기]로 같은 녹음을 올린다(녹음임시보관 결정 2번)
        setSend("offline");
        return;
      }
      recorder.discard();
      router.replace(`/records/${id}`);
      return;
    }
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
          title={stopped ? "올리는 중" : "녹음 중"}
          vi={stopped ? "Đang tải lên" : "Đang ghi âm"}
          right={
            send !== "sending" && (
              <button type="button" className="text-link" onClick={() => setLeaving(true)}>
                <BtnLabel ko="나가기" vi="Thoát" />
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
            ? "녹음을 올리고 있어요."
            : `남은 시간 ${clock(left)} · 5분이 되면 자동으로 멈춰요.`}
        </p>
        {send === "offline" && (
          <div className="reason-box" role="alert" style={{ margin: "12px 16px 0" }}>
            <b>{sendError?.ko ?? "인터넷 연결을 확인하세요."}</b>
            <span className="vi">{sendError?.vi ?? "Hãy kiểm tra kết nối Internet."}</span>
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
              <BtnLabel
                ko={send === "sending" ? "올리는 중" : "다시 올리기"}
                vi={send === "sending" ? "Đang tải lên" : "Tải lên lại"}
              />
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-center"
            onClick={() => {
              // 지금 녹음을 버리고 바로 새로 녹음한다(10/27 팀장: [삭제] → [다시 시도], 10/29 이름 [다시 녹음하기]).
              recorder.discard();
              setSend("idle");
              void recorder.start();
            }}
            disabled={send === "sending"}
          >
            <Icon name="refresh" />
            <BtnLabel ko="다시 녹음하기" vi="Ghi âm lại" />
          </button>
        </div>
        <div style={{ height: 22 }} />
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
        <span className="vi" style={{ display: "block" }}>
          Khi sẵn sàng, hãy bắt đầu ghi âm.
        </span>
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
              <span className="vi" style={{ display: "block" }}>
                Hãy kể thoải mái về việc đã hỗ trợ, bữa ăn, giấc ngủ và những thay đổi hôm nay.
              </span>
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
              <span className="vi" style={{ display: "block" }}>
                AI tạo bản nháp theo từng mục và chỉ ra chỗ cần kiểm tra.
              </span>
            </div>
          </div>
          {/* 한 녹음에 두 언어를 섞으면 받아쓰기가 한쪽 말을 빼거나 잘못 옮긴다(결정 2026-10-30-녹음한언어, 이슈 #187) */}
          <div className="hint">
            <span className="icon-bubble sm">
              <Icon name="info" />
            </span>
            <div>
              <b>한국어나 모국어 중 하나로 말해 주세요.</b>
              <span className="vi" style={{ display: "block" }}>
                Hãy nói bằng một thứ tiếng: tiếng Hàn hoặc tiếng mẹ đẻ.
              </span>
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
      </section>
    </MobileScreen>
  );
}
