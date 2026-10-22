"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  applyMealAddition,
  canApprove,
  canSubmit,
  caseData,
  countUnresolved,
  createDemoState,
  demoAgentSteps,
  itemOrder,
  itemStatusLabel,
  koreanDateTime,
  statusLabel,
  statusVi,
  STORAGE_KEY,
} from "@/lib/demo/state";
import type { DemoState, Item, ItemKey, Role, Screen } from "@/lib/demo/state";

const paths: Record<Screen, string> = {
  today: "W1 · 오늘",
  record: "W2 · 음성 메모",
  draft: "W3 · 기록 초안 확인",
  archive: "W4 · 기록함",
  helper: "W6 · 도우미",
  profile: "W5 · 내 정보",
  pending: "R1 · 검토 대기",
  review: "R2 · 검토 화면",
  approved: "R3 · 승인한 기록",
};
const workerMenus: { key: Screen; ko: string; vi: string; icon: string }[] = [
  { key: "today", ko: "오늘", vi: "Hôm nay", icon: "home" },
  { key: "archive", ko: "기록함", vi: "Nhật ký", icon: "book" },
  { key: "helper", ko: "도우미", vi: "Hỗ trợ", icon: "chat" },
  { key: "profile", ko: "내 정보", vi: "Cá nhân", icon: "user" },
];
const reviewerMenus: { key: Screen; name: string; icon: string }[] = [
  { key: "pending", name: "검토 대기", icon: "list" },
  { key: "approved", name: "승인한 기록", icon: "check" },
  { key: "profile", name: "어르신·작성자", icon: "users" },
];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const pathsByName: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
        <path d="M9 21v-8h6v8" />
      </>
    ),
    book: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="3" />
        <path d="M8 8h8M8 12h8M8 16h4" />
      </>
    ),
    chat: (
      <>
        <path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5H4l2-4A8.5 8.5 0 1 1 20 11.5Z" />
        <path d="M8.5 11h7" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M17 5a3 3 0 0 1 0 6m2 9h3a6 6 0 0 0-5-6" />
      </>
    ),
    list: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h1M3 12h1M3 18h1" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 5 5L20 7" />
        <circle cx="12" cy="12" r="10" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    left: (
      <>
        <path d="M19 12H5m6-6-6 6 6 6" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
    alert: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 7v6m0 4h.01" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    speaker: (
      <>
        <path d="M4 9v6h4l5 4V5L8 9H4Zm13-1a6 6 0 0 1 0 8" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4l12-12-4-4L4 16v4Zm10-14 4 4" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 0v5h5M8 12h8m-8 4h8" />
      </>
    ),
    reset: (
      <>
        <path d="M4 11a8 8 0 1 1 2 6M4 4v7h7" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 9 4v6c0 5-3.4 8.2-9 10-5.6-1.8-9-5-9-10V6l9-4Zm-4 9 3 3 5-5" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5" />
      </>
    ),
    printer: (
      <>
        <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </>
    ),
    heart: <path d="M12 21S3 15.2 3 8.5a5 5 0 0 1 9-3 5 5 0 0 1 9 3C21 15.2 12 21 12 21Z" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
  };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...common}>
      {pathsByName[name] ?? pathsByName.file}
    </svg>
  );
}
function Button({
  children,
  variant = "primary",
  icon,
  onClick,
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger" | "subtle";
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`cb-btn cb-btn-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}
function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "success" | "warning" | "info";
}) {
  return (
    <span className={`cb-badge cb-badge-${tone}`}>
      {tone === "warning" && <Icon name="alert" size={13} />} {children}
    </span>
  );
}
function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}
function SectionTitle({
  label,
  subtitle,
  trail,
}: {
  label: string;
  subtitle?: string;
  trail?: ReactNode;
}) {
  return (
    <div className="cb-section-heading">
      <div>
        <h2>{label}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {trail}
    </div>
  );
}
function highlightExcerpt(transcript: string, evidence: string) {
  if (!evidence || !transcript.includes(evidence)) return transcript;
  const index = transcript.indexOf(evidence);
  return (
    <>
      {transcript.slice(0, index)}
      <mark>{evidence}</mark>
      {transcript.slice(index + evidence.length)}
    </>
  );
}

export function CareBridgeApp() {
  const [role, setRole] = useState<Role>("worker");
  const [screen, setScreen] = useState<Screen>("today");
  const [demo, setDemo] = useState<DemoState>(createDemoState);
  const [hydrated, setHydrated] = useState(false);
  const [selected, setSelected] = useState<ItemKey>("discomfort");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<ItemKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [skipNote, setSkipNote] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [filter, setFilter] = useState("전체");
  const [filterDate, setFilterDate] = useState("2026-10-22");
  const [filterCare, setFilterCare] = useState("전체");
  const [recordMode, setRecordMode] = useState<"audio" | "text">("audio");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [inputText, setInputText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [helpQuestion, setHelpQuestion] = useState("");
  const [helpAnswer, setHelpAnswer] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Prevent a late microphone permission response from starting capture after navigation.
  const recordSessionRef = useRef(0);

  useEffect(() => {
    // Restore only after mount so server and first client render stay consistent.
    // Schedule outside the effect body to satisfy react-hooks/set-state-in-effect.
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (
            parsed &&
            typeof parsed === "object" &&
            "items" in parsed &&
            Array.isArray(parsed.items) &&
            parsed.items.length === 9
          ) {
            setDemo(parsed as DemoState);
          }
        }
      } catch {
        /* 손상된 브라우저 시연 데이터는 초기화 */
      }
      setHydrated(true);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        setDemo(JSON.parse(event.newValue) as DemoState);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
  }, [demo, hydrated]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (recordSeconds < 300 || !recording) return;
    // Stop at five minutes without referencing a later-declared callback.
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    // Schedule the React state update rather than updating in the effect body.
    const frame = window.requestAnimationFrame(() => {
      setRecording(false);
      setAudioReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recordSeconds, recording]);
  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const update = useCallback((change: (prev: DemoState) => DemoState) => {
    setDemo((prev) => change(prev));
  }, []);
  const navigate = (next: Screen, nextRole?: Role) => {
    if (next !== "record") {
      recordSessionRef.current += 1;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setAudioReady(false);
    }
    if (nextRole) setRole(nextRole);
    setScreen(next);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const addEvent = (prev: DemoState, action: string, actor: string, detail = ""): DemoState => ({
    ...prev,
    revision: prev.revision + 1,
    events: [...prev.events, { action, actor, detail, at: new Date().toISOString() }],
  });
  const reset = () => {
    if (!window.confirm("합성 사례 S-F01을 초기화할까요? 기존 Mock 진행 상태가 사라집니다."))
      return;
    recordSessionRef.current += 1;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setDemo(createDemoState());
    setRecording(false);
    setRecordSeconds(0);
    setAudioReady(false);
    setInputText("");
    navigate("today", "worker");
  };

  const startAudio = async () => {
    const session = ++recordSessionRef.current;
    setAudioError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAudioError("이 브라우저는 녹음을 지원하지 않습니다. 글로 쓰기를 선택하세요.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== recordSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mime = ["audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start();
      recorderRef.current = recorder;
      setAudioReady(false);
      setRecordSeconds(0);
      setRecording(true);
    } catch {
      setAudioError(
        "마이크 접근이 차단됐습니다. 브라우저에서 권한을 허용하거나 [글로 쓰기]를 사용하세요.",
      );
    }
  };
  const stopAudio = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
    setAudioReady(true);
  };
  const discardAudio = () => {
    if (recording) stopAudio();
    setAudioReady(false);
    setRecordSeconds(0);
    setMessage("녹음한 음성을 버렸습니다. Mock에서는 파일을 서버에 올리지 않습니다.");
  };
  const prepareDraft = () => {
    if (recordMode === "text" && !inputText.trim()) {
      setMessage("기록할 문장을 입력해 주세요.");
      return;
    }
    setProcessing(true);
    navigate("draft");
    // Mock 모드: 음성은 받아쓰지 않으며 S-F01의 정답 초안만 보여 준다.
    window.setTimeout(() => {
      update((prev) => ({
        ...prev,
        status: "draft",
        draftPrepared: true,
        recordingText: recordMode === "text" ? inputText : caseData.transcript,
      }));
      setProcessing(false);
    }, 900);
  };
  const confirmItem = (key: ItemKey) => {
    update((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.item_key === key ? { ...item, confirmed: true } : item,
      ),
    }));
  };
  const confirmAll = () => {
    update((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.status !== "needs_check" ? { ...item, confirmed: true } : item,
      ),
    }));
    setMessage("관찰·언급 없음 항목을 확인했습니다. '확인 필요'는 담당자가 검토합니다.");
  };
  const saveWorkerEdit = (key: ItemKey, value: string) => {
    if (!value.trim()) {
      setMessage("내용을 입력해 주세요.");
      return;
    }
    update((prev) =>
      addEvent(
        {
          ...prev,
          items: prev.items.map((item) =>
            item.item_key === key
              ? {
                  ...item,
                  value_ko: value,
                  value_native: "",
                  status: "observed",
                  confirmed: true,
                  source: "worker",
                  resolution: null,
                }
              : item,
          ),
        },
        "edited",
        "마이",
        `${itemOrder.find((n) => n.key === key)?.ko} 직접 수정`,
      ),
    );
    setEditing(null);
    setMessage("수정했습니다. 모국어 번역은 API 연결 후 다시 생성해야 합니다.");
  };
  const submit = () => {
    if (!canSubmit(demo.items)) {
      setMessage("[맞아요]로 확인하지 않은 항목이 있습니다.");
      return;
    }
    update((prev) =>
      addEvent(
        { ...prev, status: "submitted", submittedAt: new Date().toISOString(), returnReason: "" },
        "submitted",
        "마이",
        "담당자에게 기록 제출",
      ),
    );
    navigate("archive");
    setMessage("기록을 담당자에게 보냈습니다. (같은 브라우저의 Mock 데이터)");
  };
  const resolveItem = (key: ItemKey, resolution: "confirmed_by_reviewer" | "omitted") => {
    if (resolution === "omitted" && !skipNote.trim()) {
      setMessage("[기록 안 함] 사유를 적어 주세요.");
      return;
    }
    update((prev) =>
      addEvent(
        {
          ...prev,
          items: prev.items.map((item) =>
            item.item_key === key
              ? {
                  ...item,
                  resolution,
                  status: resolution === "omitted" ? "not_mentioned" : item.status,
                  value_ko: resolution === "omitted" ? "" : item.value_ko,
                  value_native: resolution === "omitted" ? "" : item.value_native,
                  source: "reviewer",
                  confirmed: false,
                }
              : item,
          ),
        },
        "resolved",
        "박 사회복지사",
        resolution === "omitted" ? `기록 안 함: ${skipNote}` : "확인함",
      ),
    );
    setSkipNote("");
    setMessage(
      resolution === "omitted"
        ? "사유와 함께 기록에서 제외했습니다."
        : "담당자가 내용을 확인했습니다.",
    );
  };
  const reviewerEdit = (key: ItemKey, value: string) => {
    update((prev) =>
      addEvent(
        {
          ...prev,
          items: prev.items.map((item) =>
            item.item_key === key
              ? {
                  ...item,
                  value_ko: value,
                  value_native: "",
                  source: "reviewer",
                  confirmed: false,
                  resolution: item.status === "needs_check" ? null : item.resolution,
                }
              : item,
          ),
        },
        "edited",
        "박 사회복지사",
        "담당자 직접 수정",
      ),
    );
    setEditing(null);
    setMessage("수정 내용을 저장했습니다. 번역은 서버 연동 후 다시 생성해야 합니다.");
  };
  const approve = () => {
    if (!canApprove(demo)) {
      setMessage(`확인 필요 ${countUnresolved(demo.items)}개 남음. 승인이 불가능합니다.`);
      return;
    }
    update((prev) =>
      addEvent(
        { ...prev, status: "approved", approvedAt: new Date().toISOString() },
        "approved",
        "박 사회복지사",
        "기록 승인",
      ),
    );
    navigate("approved");
    setMessage("승인 완료. 기록은 읽기 전용으로 전환됐습니다.");
  };
  const returnRecord = () => {
    if (!returnNote.trim()) {
      setMessage("되돌리기 사유를 입력해야 합니다.");
      return;
    }
    update((prev) =>
      addEvent(
        { ...prev, status: "returned", returnReason: returnNote },
        "returned",
        "박 사회복지사",
        returnNote,
      ),
    );
    navigate("pending");
    setReturnNote("");
    setMessage("기록을 작성자에게 되돌렸습니다. (Mock 브라우저 저장)");
  };

  const unresolved = countUnresolved(demo.items);
  const highlightedItem = demo.items.find((item) => item.item_key === selected);
  const workerHeader = (
    <header className="cb-mobile-top">
      <div className="cb-brand">
        <span className="cb-brand-icon">
          <Icon name="heart" size={19} />
        </span>
        <span>
          carebridge<span className="cb-brand-dot">.</span>
        </span>
      </div>
      <div className="cb-avatar" title="작성자 마이">
        M
      </div>
    </header>
  );
  const mobileNav = (
    <nav className="cb-mobile-tabs" aria-label="작성자 화면 메뉴">
      {workerMenus.map((item) => (
        <button
          key={item.key}
          type="button"
          className={screen === item.key ? "active" : ""}
          onClick={() => navigate(item.key)}
        >
          <Icon name={item.icon} />
          <span>{item.ko}</span>
          <small lang="vi">{item.vi}</small>
        </button>
      ))}
    </nav>
  );

  const workerView = () => {
    if (screen === "today")
      return (
        <>
          <div className="cb-welcome">
            <p className="cb-eyebrow">THURSDAY, OCT 22</p>
            <h1>
              오늘도 좋은 하루예요, 마이님 <span aria-hidden>✳</span>
            </h1>
            <p>카드를 눌러 기록을 시작하세요.</p>
            <p className="cb-translation" lang="vi">
              Nhấn vào thẻ để bắt đầu ghi chép.
            </p>
          </div>
          <div className="cb-date-chip">
            <Icon name="clock" size={16} /> 10월 22일 (목){" "}
            <span lang="vi">Thứ Năm, ngày 22 tháng 10</span>
          </div>
          {demo.status === "returned" && (
            <div className="cb-alert">
              <Icon name="alert" /> 되돌아온 기록 1건 <span lang="vi">1 hồ sơ bị trả lại</span>
            </div>
          )}
          <SectionTitle label="오늘의 돌봄" subtitle="담당 어르신 1명 · 합성 사례" />
          <button
            className="cb-person-card"
            onClick={() =>
              navigate(
                demo.status === "draft"
                  ? demo.draftPrepared
                    ? "draft"
                    : "record"
                  : demo.status === "returned"
                    ? "draft"
                    : "archive",
              )
            }
          >
            <div className="cb-person-top">
              <span className="cb-person-mark">
                <Icon name="heart" size={25} />
              </span>
              <Badge
                tone={
                  demo.status === "approved"
                    ? "success"
                    : demo.status === "returned"
                      ? "warning"
                      : "muted"
                }
              >
                {demo.status === "draft" && !demo.draftPrepared
                  ? "작성 전"
                  : statusLabel[demo.status]}
              </Badge>
            </div>
            <h3>김○○ 어르신</h3>
            <span className="cb-translation" lang="vi">
              Người cao tuổi được phân công
            </span>
            <div className="cb-person-data">
              <span>
                급여 종류 <b>시설</b>
              </span>
              <span>
                돌봄 시간 <b>매일 오전 7:00 ~ 오후 4:00</b>
              </span>
            </div>
            <div className="cb-person-bottom">
              <span>
                {demo.status === "draft" && !demo.draftPrepared
                  ? "기록 시작하기"
                  : demo.status === "returned"
                    ? "수정해서 다시 보내기"
                    : "기록 확인하기"}
              </span>
              <Icon name="arrow" size={19} />
            </div>
          </button>
          <div className="cb-soft-hint">
            <Icon name="shield" />
            <div>
              <strong>기록은 작성자가 확인해요</strong>
              <p>AI는 기록 초안만 정리합니다. 최종 판단은 담당자가 합니다.</p>
            </div>
          </div>
        </>
      );
    if (screen === "record")
      return (
        <>
          <button className="cb-back" onClick={() => navigate("today")}>
            <Icon name="left" size={17} /> 오늘로 돌아가기
          </button>
          <div className="cb-title">
            <p className="cb-eyebrow">STEP 01 / VOICE NOTE</p>
            <h1>음성 메모</h1>
            <p lang="vi" className="cb-translation">
              Ghi chú bằng giọng nói
            </p>
          </div>
          <div className="cb-person-strip">
            <Icon name="heart" /> 김○○ 어르신 <Badge>시설</Badge>
          </div>
          <div className="cb-record-card">
            <span className="cb-voice-motif">
              <Icon name="mic" size={33} />
            </span>
            <h2>편하게 말해 주세요</h2>
            <p>오늘 도운 일, 식사, 수면, 달라진 점을 편하게 말해 주세요.</p>
            <p className="cb-translation" lang="vi">
              Hãy nói về việc chăm sóc, bữa ăn, giấc ngủ và những thay đổi hôm nay.
            </p>
            <div className="cb-mode-switch">
              <button
                className={recordMode === "audio" ? "active" : ""}
                onClick={() => setRecordMode("audio")}
              >
                🎤 말하기
              </button>
              <button
                className={recordMode === "text" ? "active" : ""}
                onClick={() => {
                  recordSessionRef.current += 1;
                  if (recorderRef.current?.state === "recording") recorderRef.current.stop();
                  streamRef.current?.getTracks().forEach((track) => track.stop());
                  setRecording(false);
                  setAudioReady(false);
                  setRecordMode("text");
                }}
              >
                ✏️ 글로 쓰기
              </button>
            </div>
            {recordMode === "audio" ? (
              <>
                <div className="cb-record-timer">
                  {String(Math.floor(recordSeconds / 60)).padStart(2, "0")}:
                  {String(recordSeconds % 60).padStart(2, "0")} <small>/ 05:00</small>
                </div>
                <p className="cb-record-state">
                  {recording
                    ? "● 녹음 중 · 남은 시간 " +
                      `${String(Math.floor((300 - recordSeconds) / 60)).padStart(2, "0")}:${String((300 - recordSeconds) % 60).padStart(2, "0")}`
                    : audioReady
                      ? "녹음이 끝났습니다."
                      : "시작을 누르면 녹음됩니다."}
                </p>
                {audioError && <div className="cb-warning">{audioError}</div>}
                {!recording && !audioReady && (
                  <Button icon="mic" onClick={startAudio} className="cb-full">
                    녹음 시작
                  </Button>
                )}
                {recording && (
                  <Button variant="danger" onClick={stopAudio} className="cb-full">
                    ■ 녹음 정지
                  </Button>
                )}
                {audioReady && (
                  <div className="cb-actions">
                    <Button icon="arrow" onClick={prepareDraft}>
                      정리하기
                    </Button>
                    <Button variant="outline" onClick={discardAudio}>
                      녹음 삭제
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="cb-field-label" htmlFor="worker-text">
                  돌봄 내용 적기
                </label>
                <textarea
                  id="worker-text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={6}
                  className="cb-input"
                />
                <Button icon="arrow" className="cb-full" onClick={prepareDraft}>
                  기록 초안 확인
                </Button>
              </>
            )}
          </div>
          <p className="cb-note">
            어르신과의 대화는 녹음하지 않아요. 이 시연에서는 음성을 서버에 보내거나 실제로 받아쓰지
            않고 S-F01 합성 사례 결과를 표시합니다.
          </p>
        </>
      );
    if (screen === "draft")
      return (
        <>
          <button className="cb-back" onClick={() => navigate("today")}>
            <Icon name="left" size={17} /> 오늘로 돌아가기
          </button>
          <div className="cb-title">
            <p className="cb-eyebrow">STEP 02 / REVIEW</p>
            <h1>기록 초안 확인</h1>
            <p className="cb-translation" lang="vi">
              Kiểm tra bản nháp
            </p>
          </div>
          {demo.returnReason && (
            <div className="cb-alert">
              <Icon name="alert" /> 되돌린 사유: {demo.returnReason}
              <p className="cb-translation">담당자의 요청을 확인하고 다시 보내주세요.</p>
            </div>
          )}
          {processing ? (
            <div className="cb-processing">
              <span className="cb-spinner" />
              <h3>기록을 정리 중입니다</h3>
              <p>글자로 바꾸는 중 → 정리 중</p>
              <small>MOCK · 미리 준비된 S-F01 초안을 불러옵니다.</small>
            </div>
          ) : (
            <>
              <div className="cb-summary-bar">
                <div>
                  <strong>9개 기록 항목</strong>
                  <small>한국어를 먼저 확인하고 모국어를 살펴보세요.</small>
                </div>
                <Badge tone={unresolved ? "warning" : "success"}>
                  {unresolved ? `확인 필요 ${unresolved}개` : "확인 필요 없음"}
                </Badge>
              </div>
              <button className="cb-confirm-all" onClick={confirmAll}>
                관찰·언급 없음 항목 모두 [맞아요]로 확인하기
              </button>
              <div className="cb-item-list">
                {demo.items.map((item) => {
                  const info = itemOrder.find((i) => i.key === item.item_key)!;
                  return (
                    <section className="cb-item-card" key={item.item_key}>
                      <div className="cb-item-heading">
                        <div>
                          <h3>{info.ko}</h3>
                          <span className="cb-translation" lang="vi">
                            {info.vi}
                          </span>
                        </div>
                        <Badge
                          tone={
                            item.status === "needs_check"
                              ? "warning"
                              : item.status === "observed"
                                ? "success"
                                : "muted"
                          }
                        >
                          {itemStatusLabel[item.status]}
                        </Badge>
                      </div>
                      {editing === item.item_key ? (
                        <div className="cb-edit-box">
                          <textarea
                            className="cb-input"
                            rows={3}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                          />
                          <div className="cb-actions">
                            <Button onClick={() => saveWorkerEdit(item.item_key, editValue)}>
                              수정 저장
                            </Button>
                            <Button variant="outline" onClick={() => setEditing(null)}>
                              취소
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="cb-item-content">
                            <p>{item.value_ko || "말한 내용이 없습니다."}</p>
                            <span lang="vi" className="cb-translation">
                              {item.value_native || "(번역 대기 / Không có nội dung)"}
                            </span>
                          </div>
                          {item.source === "ai" && !item.confirmed && (
                            <span className="cb-ai-label">✧ AI 초안</span>
                          )}
                          {item.status === "needs_check" && (
                            <p className="cb-item-reason">
                              <Icon name="alert" size={14} />
                              {item.reason}
                            </p>
                          )}
                          <details className="cb-evidence">
                            <summary>내가 한 말 · 기록 근거 보기</summary>
                            <p>{item.evidence || "원문에서 언급되지 않았습니다."}</p>
                          </details>
                          <div className="cb-item-actions">
                            <button
                              onClick={() => speak(item.value_ko || info.ko)}
                              aria-label={`${info.ko} 한국어 듣기`}
                            >
                              <Icon name="speaker" size={16} /> 듣기
                            </button>
                            <button
                              onClick={() => {
                                setEditing(item.item_key);
                                setEditValue(item.value_ko);
                              }}
                            >
                              <Icon name="edit" size={16} /> 달라요
                            </button>
                            {item.item_key === "meal" && item.status === "needs_check" && (
                              <button
                                className="cb-addition"
                                onClick={() => {
                                  update(applyMealAddition);
                                  setMessage(
                                    "‘죽 반 안 되게 드셨어요.’를 반영했습니다. (S-F01 Mock)",
                                  );
                                }}
                              >
                                + 말로 보태기
                              </button>
                            )}
                            <button
                              className={item.confirmed ? "confirmed" : ""}
                              onClick={() => confirmItem(item.item_key)}
                            >
                              <Icon name="check" size={16} />
                              {item.confirmed ? "확인했어요" : "맞아요"}
                            </button>
                          </div>
                        </>
                      )}
                      {item.item_key === "notes" && (
                        <small className={item.value_ko.length > 200 ? "cb-overlimit" : "cb-count"}>
                          특이사항 {item.value_ko.length}/200자{" "}
                          {item.value_ko.length > 200 ? "· 200자 초과(전송 가능)" : ""}
                        </small>
                      )}
                      {item.item_key === "discomfort" && item.status === "needs_check" && (
                        <p className="cb-health-note">건강·안전 신호는 담당자에게 바로 알리세요.</p>
                      )}
                    </section>
                  );
                })}
              </div>
              <div className="cb-fixed-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMessage("이 브라우저에 Mock 임시 저장됐습니다.");
                    navigate("archive");
                  }}
                >
                  임시 저장
                </Button>
                <Button
                  variant="primary"
                  icon="arrow"
                  onClick={submit}
                  disabled={!canSubmit(demo.items)}
                >
                  담당자에게 보내기
                </Button>
              </div>
              {!canSubmit(demo.items) && (
                <p className="cb-inline-tip">
                  [맞아요]로 확인하지 않은 항목이 있습니다. ‘확인 필요’ 항목은 남겨 두고 전송할 수
                  있습니다.
                </p>
              )}
            </>
          )}
        </>
      );
    if (screen === "archive")
      return (
        <>
          <div className="cb-title">
            <p className="cb-eyebrow">MY RECORDS</p>
            <h1>기록함</h1>
            <p className="cb-translation" lang="vi">
              Nhật ký
            </p>
          </div>
          <div className="cb-segment-row">
            <Badge>{statusLabel[demo.status]}</Badge>
            <small>합성 사례 S-F01</small>
          </div>
          <div className="cb-person-card cb-archive-card">
            <h3>김○○ 어르신</h3>
            <p>10월 22일 · 시설급여</p>
            <div className="cb-person-data">
              현재 상태: {statusLabel[demo.status]}
              <span className="cb-translation" lang="vi">
                {statusVi[demo.status]}
              </span>
            </div>
            {demo.returnReason && <div className="cb-alert">담당자 사유: {demo.returnReason}</div>}
            <div className="cb-actions">
              {(demo.status === "draft" || demo.status === "returned") && (
                <Button onClick={() => navigate("draft")}>이어서 확인하기</Button>
              )}
              {demo.status === "submitted" && (
                <span className="cb-note">담당자 검토를 기다리고 있습니다.</span>
              )}
              {demo.status === "approved" && (
                <span className="cb-note">승인 완료 · 읽기 전용 기록</span>
              )}
            </div>
          </div>
        </>
      );
    if (screen === "helper")
      return (
        <>
          <div className="cb-title">
            <h1>도우미</h1>
            <p className="cb-translation" lang="vi">
              Hỗ trợ
            </p>
          </div>
          <div className="cb-alert">
            <Icon name="alert" /> 건강·안전 문제는 담당자에게 먼저 보고하세요.
          </div>
          <div className="cb-panel">
            <h3>궁금한 표현이 있나요?</h3>
            <p className="cb-note">
              이 화면은 기록 작성과 별개입니다. 서버의 교재 검색 API는 아직 연결되지 않았습니다.
            </p>
            <textarea
              value={helpQuestion}
              onChange={(e) => setHelpQuestion(e.target.value)}
              className="cb-input"
              placeholder="예: 진지 잡수세요가 무슨 뜻이에요?"
              rows={3}
            />
            <Button onClick={() => setHelpAnswer(true)} disabled={!helpQuestion.trim()}>
              질문하기
            </Button>
            {helpAnswer && (
              <p className="cb-warning">
                교재 API가 연결되지 않아 답변을 만들 수 없습니다. 담당자에게 문의하세요. (Mock)
              </p>
            )}
          </div>
        </>
      );
    return (
      <>
        <div className="cb-title">
          <h1>내 정보</h1>
          <p className="cb-translation" lang="vi">
            Cá nhân
          </p>
        </div>
        <div className="cb-panel">
          <h3>마이 · 작성자</h3>
          <p>표시 언어: 한국어 + 베트남어</p>
          <p>글자 크기: 기본</p>
          <p className="cb-note">실제 개인 설정과 로그인은 Supabase 연결 후 제공됩니다.</p>
        </div>
      </>
    );
  };

  const reviewerView = () => {
    if (screen === "pending")
      return (
        <>
          <div className="cb-title cb-desktop-title">
            <div>
              <p className="cb-eyebrow">REVIEW QUEUE</p>
              <h1>검토 대기</h1>
              <p>담당자 확인이 필요한 돌봄 기록을 검토합니다.</p>
            </div>
            <Badge tone={demo.status === "submitted" ? "warning" : "muted"}>
              검토 대기 {demo.status === "submitted" ? 1 : 0}건
            </Badge>
          </div>
          <div className="cb-panel cb-filter-bar">
            <label>
              작성자{" "}
              <select
                className="cb-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option>전체</option>
                <option>마이</option>
              </select>
            </label>
            <label>
              날짜{" "}
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="cb-select"
              />
            </label>
            <label>
              급여 종류{" "}
              <select
                className="cb-select"
                value={filterCare}
                onChange={(e) => setFilterCare(e.target.value)}
              >
                <option>전체</option>
                <option>시설</option>
                <option>재가</option>
              </select>
            </label>
            <Button
              variant="outline"
              onClick={() => {
                setFilter("전체");
                setFilterDate("");
                setFilterCare("전체");
              }}
            >
              필터 지우기
            </Button>
          </div>
          <div className="cb-table-frame">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>어르신</th>
                  <th>급여 종류</th>
                  <th>작성자</th>
                  <th>방문·돌봄 시간</th>
                  <th>
                    <span>확인 필요 ↓</span>
                    <span className="cb-sr-only">확인 필요 많은 기록부터 정렬됨</span>
                  </th>
                  <th>받은 시각</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {demo.status === "submitted" &&
                (!filterDate || filterDate === "2026-10-22") &&
                (filterCare === "전체" || filterCare === "시설") ? (
                  <tr
                    className="cb-click-row"
                    tabIndex={0}
                    role="button"
                    onClick={() => navigate("review")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate("review");
                      }
                    }}
                  >
                    <td>
                      <b>김○○ 어르신</b>
                    </td>
                    <td>시설</td>
                    <td>마이</td>
                    <td>매일 오전 7:00 ~ 오후 4:00</td>
                    <td>
                      <Badge tone={unresolved ? "warning" : "success"}>{unresolved}개</Badge>
                    </td>
                    <td>{koreanDateTime(demo.submittedAt)}</td>
                    <td>
                      <Icon name="arrow" size={18} />
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <div className="cb-empty">
                        <Icon name="check" size={28} />
                        <h3>검토할 기록이 없습니다.</h3>
                        <p>작성자가 제출하면 이 목록에 나타납니다.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="cb-demo-nudge">
            <Icon name="layers" />
            <span>
              시나리오 1을 시연하려면 작성자 화면에서 W1 → W2 → W3을 거쳐 기록을 제출하세요. 두 기기
              간 동기화는 지원하지 않습니다.
            </span>
            <Button variant="outline" onClick={() => navigate("today", "worker")}>
              작성자 화면으로
            </Button>
          </div>
        </>
      );
    if (screen === "review")
      return (
        <>
          <button className="cb-back" onClick={() => navigate("pending")}>
            <Icon name="left" size={17} /> 검토 대기
          </button>
          <div className="cb-title cb-desktop-title">
            <div>
              <p className="cb-eyebrow">RECORD REVIEW · FORM 16</p>
              <h1>김○○ 어르신 기록 검토</h1>
              <p>10월 22일 · 시설급여 · 작성자 마이 · 검증됨</p>
            </div>
            <Badge tone={unresolved ? "warning" : "success"}>
              {unresolved ? `확인 필요 ${unresolved}개 남음` : "확인 항목 해결됨"}
            </Badge>
          </div>
          <div className="cb-review-grid">
            <div className="cb-panel cb-transcript-panel">
              <div className="cb-pane-title">
                <Icon name="mic" />
                <h2>받아쓴 원문</h2>
              </div>
              <div className="cb-transcript">
                {highlightExcerpt(demo.transcript, highlightedItem?.evidence ?? "")}
              </div>
              <h3>한국어 번역</h3>
              <div className="cb-translated-transcript">{demo.transcript_ko}</div>
              <div className="cb-soft-hint">
                <Icon name="search" />
                <p>오른쪽 항목을 선택하면 해당 근거 문장이 강조됩니다.</p>
              </div>
            </div>
            <div className="cb-review-items">
              <div className="cb-review-top">
                <h2>9개 기록 항목</h2>
                <span>항목 선택 · 수정 · 확인</span>
              </div>
              {demo.items.map((item) => {
                const info = itemOrder.find((n) => n.key === item.item_key)!;
                return (
                  <section
                    key={item.item_key}
                    className={`cb-review-card ${selected === item.item_key ? "selected" : ""}`}
                  >
                    <button
                      className="cb-review-card-top"
                      onClick={() => setSelected(item.item_key)}
                      aria-expanded={selected === item.item_key}
                    >
                      <strong>{info.ko}</strong>
                      <Badge
                        tone={
                          item.status === "needs_check"
                            ? "warning"
                            : item.status === "observed"
                              ? "success"
                              : "muted"
                        }
                      >
                        {item.resolution ? "담당자 확인 완료" : itemStatusLabel[item.status]}
                      </Badge>
                      <Icon name="chevron" size={17} />
                    </button>
                    <p className="cb-review-value">{item.value_ko || "기록 내용 없음"}</p>
                    {selected === item.item_key && (
                      <div className="cb-review-expanded">
                        <div className="cb-record-reference">
                          공식 기록지 칸 · 별지 제16호 (검증됨)
                        </div>
                        <p>
                          <b>근거:</b> {item.evidence || "원문 언급 없음"}
                        </p>
                        {item.reason && (
                          <p>
                            <b>확인 사유:</b> {item.reason}
                          </p>
                        )}
                        {editing === item.item_key ? (
                          <div>
                            <textarea
                              className="cb-input"
                              rows={3}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                            />
                            <div className="cb-actions">
                              <Button onClick={() => reviewerEdit(item.item_key, editValue)}>
                                수정 저장
                              </Button>
                              <Button variant="outline" onClick={() => setEditing(null)}>
                                취소
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="cb-actions">
                            <Button
                              variant="outline"
                              icon="edit"
                              onClick={() => {
                                setEditing(item.item_key);
                                setEditValue(item.value_ko);
                              }}
                              disabled={demo.status !== "submitted"}
                            >
                              직접 수정
                            </Button>
                            {item.item_key === "notes" && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(item.value_ko);
                                  setMessage("특이사항을 복사했습니다.");
                                }}
                              >
                                복사
                              </Button>
                            )}
                          </div>
                        )}
                        {item.status === "needs_check" &&
                          !item.resolution &&
                          demo.status === "submitted" && (
                            <div className="cb-resolution">
                              <div className="cb-warning">
                                확인 필요: 담당자가 내용을 확인하거나 기록에서 제외해야 합니다.
                              </div>
                              <div className="cb-actions">
                                <Button
                                  onClick={() =>
                                    resolveItem(item.item_key, "confirmed_by_reviewer")
                                  }
                                >
                                  확인함
                                </Button>
                              </div>
                              <label className="cb-field-label" htmlFor={`skip-${item.item_key}`}>
                                기록 안 함 사유
                              </label>
                              <input
                                className="cb-input"
                                id={`skip-${item.item_key}`}
                                value={skipNote}
                                onChange={(e) => setSkipNote(e.target.value)}
                                placeholder="사유를 적어 주세요"
                              />
                              <Button
                                variant="outline"
                                onClick={() => resolveItem(item.item_key, "omitted")}
                              >
                                기록 안 함
                              </Button>
                            </div>
                          )}
                        {item.resolution && (
                          <p className="cb-verified-note">
                            <Icon name="check" size={15} />{" "}
                            {item.resolution === "confirmed_by_reviewer"
                              ? "담당자가 내용을 확인했습니다."
                              : "사유와 함께 기록에서 제외했습니다."}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
              <details className="cb-panel cb-agent-panel">
                <summary>
                  <Icon name="layers" /> AI 작업 기록{" "}
                  <small>도구 호출 근거 4단계 · 시나리오 Mock</small>
                </summary>
                <ol>
                  {demoAgentSteps.map((step, index) => (
                    <li key={step.tool}>
                      <span className="cb-step-number">0{index + 1}</span>
                      <div>
                        <b>{step.name}</b>
                        <code>{step.tool}</code>
                        <p>이유: {step.reason}</p>
                        <p>결과: {step.result}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
              <div className="cb-panel cb-approval-panel">
                <div>
                  <h3>담당자 최종 확인</h3>
                  <p>
                    {unresolved
                      ? `확인 필요 ${unresolved}개 남음 · 해결 전 승인이 잠겨 있습니다.`
                      : "확인 필요 항목을 모두 해결했습니다. 승인할 수 있습니다."}
                  </p>
                </div>
                <Button icon="check" disabled={!canApprove(demo)} onClick={approve}>
                  승인
                </Button>
              </div>
              <div className="cb-panel cb-return-panel">
                <h3>작성자에게 되돌리기</h3>
                <p>돌려보낼 때는 사유를 반드시 적어주세요.</p>
                <textarea
                  className="cb-input"
                  rows={2}
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="되돌리는 이유"
                />
                <Button
                  variant="outline"
                  onClick={returnRecord}
                  disabled={demo.status !== "submitted"}
                >
                  되돌리기
                </Button>
              </div>
            </div>
          </div>
        </>
      );
    if (screen === "approved")
      return (
        <>
          <div className="cb-title cb-desktop-title">
            <div>
              <p className="cb-eyebrow">APPROVED RECORDS</p>
              <h1>승인한 기록</h1>
              <p>최종 승인 기록과 처리 이력을 확인합니다.</p>
            </div>
            <Badge tone="success">
              {demo.status === "approved" ? "승인한 기록 1건" : "승인한 기록 0건"}
            </Badge>
          </div>
          {demo.status === "approved" ? (
            <>
              <div className="cb-panel cb-approved-summary">
                <div>
                  <span className="cb-overline">시설급여 · 별지 제16호</span>
                  <h2>김○○ 어르신</h2>
                  <p>작성자 마이 · 승인한 사람 박 사회복지사 · {koreanDateTime(demo.approvedAt)}</p>
                </div>
                <Badge tone="success">승인됨</Badge>
              </div>
              <div className="cb-panel cb-timeline">
                <SectionTitle label="기록 이력" />
                <ol>
                  {demo.events.map((event, index) => (
                    <li key={`${event.action}-${index}`}>
                      <span className="cb-timeline-dot" />
                      <div>
                        <strong>
                          {(
                            {
                              created: "작성",
                              ai_filled: "AI 초안",
                              edited: "검토·수정",
                              submitted: "보냄",
                              resolved: "검토·수정",
                              returned: "되돌림",
                              approved: "승인",
                            } as Record<string, string>
                          )[event.action] ?? event.action}
                        </strong>
                        <p>
                          {event.actor} · {koreanDateTime(event.at)}
                        </p>
                        {event.detail && <small>{event.detail}</small>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="cb-actions cb-approved-buttons">
                <Button icon="printer" onClick={() => window.print()}>
                  인쇄·PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setMessage("승인 후, 고른 내용만 공유하는 기능입니다. 준비 중")}
                >
                  가족과 공유 <small>(준비 중)</small>
                </Button>
              </div>
            </>
          ) : (
            <div className="cb-empty cb-panel">
              <Icon name="book" size={36} />
              <h3>승인한 기록이 없습니다.</h3>
              <p>검토 대기 목록에서 기록을 확인하고 승인해 주세요.</p>
              <Button variant="outline" onClick={() => navigate("pending")}>
                검토 대기로
              </Button>
            </div>
          )}
        </>
      );
    return (
      <>
        <div className="cb-title">
          <h1>어르신·작성자</h1>
          <p>기관 등록 및 권한 관리는 백엔드 연동 후 제공됩니다.</p>
        </div>
        <div className="cb-panel">합성 사례: 김○○ 어르신 / 작성자 마이 / 담당자 박 사회복지사</div>
      </>
    );
  };

  return (
    <div className={`cb-app cb-role-${role}`}>
      <div className="cb-demo-toolbar cb-no-print">
        <div className="cb-demo-label">
          <Icon name="layers" size={16} />
          <strong>CareBridge MVP</strong>
          <span>합성 사례 S-F01 · 브라우저 Mock</span>
        </div>
        <div className="cb-demo-controls">
          <button
            className={role === "worker" ? "active" : ""}
            onClick={() => navigate("today", "worker")}
          >
            작성자 W
          </button>
          <button
            className={role === "reviewer" ? "active" : ""}
            onClick={() => navigate("pending", "reviewer")}
          >
            담당자 R
          </button>
          <button onClick={reset} title="시연 초기화" aria-label="시연 초기화">
            <Icon name="reset" size={16} />
          </button>
        </div>
      </div>
      {role === "worker" ? (
        <div className="cb-mobile-shell">
          {workerHeader}
          <main className="cb-mobile-main">{workerView()}</main>
          {mobileNav}
        </div>
      ) : (
        <div className="cb-desktop-shell">
          <aside className="cb-sidebar cb-no-print">
            <div className="cb-brand">
              <span className="cb-brand-icon">
                <Icon name="heart" size={19} />
              </span>
              <span>
                carebridge<span className="cb-brand-dot">.</span>
              </span>
            </div>
            <div className="cb-sidebar-caption">WORKSPACE / REVIEWER</div>
            <nav aria-label="담당자 메뉴">
              {reviewerMenus.map((item) => (
                <button
                  key={item.key}
                  className={screen === item.key ? "active" : ""}
                  onClick={() => navigate(item.key)}
                >
                  <Icon name={item.icon} size={18} />
                  {item.name}
                  {item.key === "pending" && demo.status === "submitted" && (
                    <span className="cb-nav-count">1</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="cb-sidebar-bottom">
              <div className="cb-sidebar-mark">
                <Icon name="shield" size={20} /> 기록은 사람의 확인으로 완성됩니다.
              </div>
              <div className="cb-sidebar-user">
                <span className="cb-avatar">박</span>
                <div>
                  <b>박 사회복지사</b>
                  <small>검토 담당자 · 시연 계정</small>
                </div>
              </div>
            </div>
          </aside>
          <main className="cb-desktop-main">
            <header className="cb-desktop-top cb-no-print">
              <div className="cb-breadcrumb">
                CareBridge <span>/</span> {paths[screen]}
              </div>
              <div className="cb-header-right">
                <Badge>MOCK</Badge>
                <span className="cb-avatar">박</span>
              </div>
            </header>
            <div className="cb-desktop-content">{reviewerView()}</div>
          </main>
        </div>
      )}
      {message && (
        <div className="cb-toast cb-no-print" role="status">
          <span>{message}</span>
          <button onClick={() => setMessage("")} aria-label="알림 닫기">
            ×
          </button>
        </div>
      )}
      <section className="cb-print-only">
        <h1>
          {demo.status === "approved" ? "장기요양급여 제공기록지(시설급여/단기보호)" : "돌봄 기록"}
        </h1>
        <p>공식 기록지 아님 · 시연용 합성 사례</p>
        <p>기록 날짜: 2026년 10월 22일 / 어르신: 김○○ / 작성자: 마이</p>
        <table>
          <tbody>
            {demo.items.map((item) => (
              <tr key={item.item_key}>
                <th>{itemOrder.find((v) => v.key === item.item_key)?.ko}</th>
                <td>{item.value_ko || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>영역별 작성자 성명(서명): ____________________</p>
        <p>
          시연용 간이 출력입니다. 법정 서식 원본과의 인쇄 일치는 백엔드 연결 후 별도 검증해야
          합니다.
        </p>
      </section>
    </div>
  );
}
