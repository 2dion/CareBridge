"use client";

// W6(도우미): 교재 근거 질문·답. 기록을 대신 쓰거나 고치지 않는다.
// 답변은 남이 쓴 내용이라 병기(원칙 ②), 내 질문은 그대로(①).
// 대화는 서버에 저장하지 않고 로그인한 계정별로 이 브라우저 안에만 남긴다(이슈 #152, lib/helper/history.ts).
import { useSearchParams } from "next/navigation";
import { type FormEvent, Fragment, useEffect, useRef, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel, Listen, Modal } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen } from "@/components/mobile/shell";
import { TextInput } from "@/components/mobile/text-field";
import { helperSuggestions, mockHelperAnswer } from "@/lib/demo/helper";
import { kstDateOf, kstTime, monthDayWeek } from "@/lib/demo/store";
import {
  browserStorage,
  clearHelperHistory,
  type LoadingMessage,
  loadHelperHistory,
  MOCK_HELPER_USER,
  saveHelperHistory,
  type StoredMessage,
} from "@/lib/helper/history";

type Message = StoredMessage | LoadingMessage;
type Row = { message: Message; dayLabel: string | null };

/** 날짜가 바뀌는 자리마다 날짜 줄(오늘 / 10월 28일 (수)). 되살린 지난 대화도 언제 물었는지 보이게 */
function withDayLabels(messages: Message[], today: string): Row[] {
  return messages.reduce<Row[]>((rows, message) => {
    if (message.from !== "me") return [...rows, { message, dayLabel: null }];
    const day = kstDateOf(message.at);
    const previous = [...rows].reverse().find((row) => row.message.from === "me")?.message;
    const previousDay = previous?.from === "me" ? kstDateOf(previous.at) : "";
    const dayLabel = day === previousDay ? null : day === today ? "오늘" : monthDayWeek(day);
    return [...rows, { message, dayLabel }];
  }, []);
}

export default function HelperPage() {
  const demo = useDemo();
  if (!demo) return <Loading tab="helper" />;
  // 실제 모드는 로그인한 계정 id, Mock은 고정 값. 계정이 바뀌면(key) 그 계정의 대화로 다시 시작한다
  const userId = demo.real?.userId ?? MOCK_HELPER_USER;
  return <HelperChat key={userId} userId={userId} />;
}

function HelperChat({ userId }: { userId: string }) {
  const demo = useDemo();
  const search = useSearchParams();
  // 화면을 열 때(다른 탭에서 돌아오기·새로 고침) 이 계정의 대화를 되살린다. 데이터가 읽힌 뒤(브라우저)에만 마운트된다
  const [messages, setMessages] = useState<Message[]>(() =>
    loadHelperHistory(browserStorage(), userId),
  );
  const [text, setText] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const nextId = useRef(messages.reduce((max, row) => Math.max(max, row.id), 0) + 1);
  const bottom = useRef<HTMLDivElement>(null);

  // 대화가 바뀔 때마다 저장(최근 50개)
  useEffect(() => {
    saveHelperHistory(browserStorage(), userId, messages);
  }, [messages, userId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  if (!demo) return <Loading tab="helper" />;
  const { today } = demo;

  const ask = (question: string, replaceId?: number) => {
    const q = question.trim();
    if (!q) return;
    const botId = replaceId ?? nextId.current + 1;
    const loading: LoadingMessage = { id: botId, from: "bot", state: "loading", question: q };
    if (replaceId === undefined) {
      const meId = nextId.current;
      nextId.current += 2;
      setMessages((prev) => [
        ...prev,
        { id: meId, from: "me", text: q, at: new Date().toISOString() },
        loading,
      ]);
      setText("");
    } else {
      setMessages((prev) => prev.map((m) => (m.id === replaceId ? loading : m)));
    }
    if (demo?.real) {
      // POST /api/helper/ask: 교재에서 찾은 내용만으로 답한다. 서버는 답을 저장하지 않는다
      void demo.real.actions.askHelper(q).then((result) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? result.ok
                ? { id: botId, from: "bot", state: "done", answer: result.data }
                : { id: botId, from: "bot", state: "error", question: q }
              : m,
          ),
        );
      });
      return;
    }
    // Mock(Supabase 설정이 없는 로컬 개발)
    window.setTimeout(() => {
      const failed = !navigator.onLine || search.get("demo") === "error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId
            ? failed
              ? { id: botId, from: "bot", state: "error", question: q }
              : { id: botId, from: "bot", state: "done", answer: mockHelperAnswer(q) }
            : m,
        ),
      );
    }, 900);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(text);
  };

  const clearConversation = () => {
    setMessages([]);
    nextId.current = 1;
    clearHelperHistory(browserStorage(), userId);
    setClearOpen(false);
  };

  const rows = withDayLabels(messages, today);

  return (
    <MobileScreen tab="helper" className="helper-screen">
      <AppBar
        title="도우미"
        vi="Trợ lý chăm sóc"
        right={
          messages.length > 0 ? (
            <button type="button" className="text-link" onClick={() => setClearOpen(true)}>
              대화 지우기
              <span className="vi" style={{ display: "block", fontSize: 11 }}>
                Xóa trò chuyện
              </span>
            </button>
          ) : undefined
        }
      />
      <div className="reason-box big helper-notice" role="note">
        <b>건강·안전 문제는 관리자에게 먼저 보고하세요.</b>
        <span className="vi">Khi có vấn đề sức khỏe hoặc an toàn, hãy báo người quản lý.</span>
      </div>
      <div className="chat" aria-live="polite">
        {messages.length === 0 && (
          <div className="stack" style={{ alignItems: "center", gap: 8, marginTop: 24 }}>
            <Art name="robot-face" width={120} />
            <p style={{ fontSize: 16, fontWeight: 700 }}>일하다 막히면 물어보세요.</p>
            <span className="vi">Hãy hỏi khi bạn gặp khó khăn.</span>
            <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
              교재에 있는 내용으로만 답해요. 기록은 대신 써 주지 않아요.
            </p>
            <span className="vi" style={{ fontSize: 12 }}>
              Chỉ trả lời theo giáo trình. Không viết bản ghi thay bạn.
            </span>
          </div>
        )}
        {rows.map(({ message, dayLabel }) => (
          <Fragment key={message.id}>
            {dayLabel && <p className="chat-day">{dayLabel}</p>}
            {message.from === "me" ? (
              <div className="bubble me">
                <p>{message.text}</p>
                <small>{kstTime(message.at)}</small>
              </div>
            ) : (
              <div className="bot-row">
                <Art name="robot-face" width={40} className="art bot-face" />
                <div className="bubble bot card">
                  <b className="bot-name">새싹로봇</b>
                  {message.state === "loading" && (
                    <p style={{ color: "var(--color-muted)" }}>교재에서 찾고 있어요…</p>
                  )}
                  {message.state === "error" && (
                    <div className="stack" style={{ alignItems: "center", gap: 4 }}>
                      <Art name="robot-face" width={80} />
                      <b>답변을 불러오지 못했어요.</b>
                      <span className="vi">Không thể tải câu trả lời.</span>
                      <p style={{ fontSize: 13 }}>네트워크를 확인하고 다시 시도해 주세요.</p>
                      <span className="vi">Vui lòng kiểm tra mạng và thử lại.</span>
                      <button
                        type="button"
                        className="btn btn-soft btn-center btn-sm"
                        onClick={() => ask(message.question, message.id)}
                      >
                        <Icon name="refresh" />
                        <BtnLabel ko="다시 시도" vi="Thử lại" />
                      </button>
                    </div>
                  )}
                  {message.state === "done" && (
                    <>
                      <p>{message.answer.ko}</p>
                      <span className="vi">{message.answer.vi}</span>
                      <span className="source">
                        {message.answer.source
                          ? `출처 · ${message.answer.source}`
                          : "교재 출처 없음"}
                      </span>
                      <div className="listen-row">
                        <Listen text={message.answer.ko} />
                        <span>듣기</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </Fragment>
        ))}
        <div ref={bottom} />
      </div>
      <div className="helper-input">
        <p style={{ fontSize: 14, fontWeight: 700 }}>이런 질문도 할 수 있어요</p>
        <div className="chips">
          {helperSuggestions.map((item) => (
            <button
              key={item.label}
              type="button"
              className="chip-f"
              onClick={() => setText(item.question)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form className="ask-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="helper-q">
            질문
          </label>
          <TextInput
            id="helper-q"
            className="input"
            value={text}
            onValueChange={setText}
            placeholder="궁금한 내용을 입력하세요."
            autoComplete="off"
          />
          <button type="submit" className="send" aria-label="보내기" disabled={!text.trim()}>
            <Icon name="send" />
          </button>
        </form>
      </div>
      <Modal open={clearOpen} onClose={() => setClearOpen(false)} label="대화를 지울까요?">
        <Art name="robot-face" width={96} />
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>대화를 지울까요?</h2>
        <span className="vi" style={{ fontSize: 13, marginTop: -6 }}>
          Bạn có muốn xóa cuộc trò chuyện?
        </span>
        <p style={{ fontSize: 14 }}>이 휴대폰에 남아 있는 도우미 대화가 모두 지워져요.</p>
        <span className="vi" style={{ fontSize: 12, marginTop: -6 }}>
          Toàn bộ cuộc trò chuyện trên máy này sẽ bị xóa.
        </span>
        <div className="btn-row" style={{ width: "100%" }}>
          <button type="button" className="btn btn-outline" onClick={() => setClearOpen(false)}>
            <BtnLabel ko="계속 대화하기" vi="Tiếp tục" />
          </button>
          <button type="button" className="btn btn-primary" onClick={clearConversation}>
            <BtnLabel ko="지우기" vi="Xóa" />
          </button>
        </div>
      </Modal>
    </MobileScreen>
  );
}
