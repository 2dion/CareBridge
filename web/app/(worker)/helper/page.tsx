"use client";

// W6(도우미): 교재 근거 질문·답. 기록을 대신 쓰거나 고치지 않는다.
// 답변은 남이 쓴 내용이라 병기(원칙 ②), 내 질문은 그대로(①).
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel, Listen, Modal } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen } from "@/components/mobile/shell";
import { TextInput } from "@/components/mobile/text-field";
import { type HelperAnswer, helperSuggestions, mockHelperAnswer } from "@/lib/demo/helper";
import { kstTime } from "@/lib/demo/store";

type Message =
  | { id: number; from: "me"; text: string; at: string }
  | { id: number; from: "bot"; state: "loading" }
  | { id: number; from: "bot"; state: "error"; question: string }
  | { id: number; from: "bot"; state: "done"; answer: HelperAnswer };

export default function HelperPage() {
  const demo = useDemo();
  const search = useSearchParams();
  // 교육용 기관이면 보고 상대가 '강사'(이슈 #146)
  const names = useRoleNames();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [endOpen, setEndOpen] = useState(false);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  if (!demo) return <Loading tab="helper" />;

  const ask = (question: string, replaceId?: number) => {
    const q = question.trim();
    if (!q) return;
    const botId = replaceId ?? nextId.current + 1;
    if (replaceId === undefined) {
      const meId = nextId.current;
      nextId.current += 2;
      setMessages((prev) => [
        ...prev,
        { id: meId, from: "me", text: q, at: new Date().toISOString() },
        { id: botId, from: "bot", state: "loading" },
      ]);
      setText("");
    } else {
      setMessages((prev) =>
        prev.map((m) => (m.id === replaceId ? { id: botId, from: "bot", state: "loading" } : m)),
      );
    }
    if (demo?.real) {
      // POST /api/helper/ask: 교재에서 찾은 내용만으로 답한다. 답은 저장하지 않는다
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

  return (
    <MobileScreen tab="helper" className="helper-screen">
      <AppBar
        title="도우미"
        vi="Trợ lý chăm sóc"
        right={
          messages.length > 0 ? (
            <button type="button" className="text-link" onClick={() => setEndOpen(true)}>
              대화 종료
            </button>
          ) : undefined
        }
      />
      <div className="reason-box big helper-notice" role="note">
        <b>건강·안전 문제는 {names.reviewer}에게 먼저 보고하세요.</b>
        <span className="vi">Khi có vấn đề sức khỏe hoặc an toàn, hãy báo {names.reviewerVi}.</span>
      </div>
      <div className="chat" aria-live="polite">
        {messages.length === 0 ? (
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
        ) : (
          <p className="chat-day">오늘</p>
        )}
        {messages.map((message) =>
          message.from === "me" ? (
            <div key={message.id} className="bubble me">
              <p>{message.text}</p>
              <small>{kstTime(message.at)}</small>
            </div>
          ) : (
            <div key={message.id} className="bot-row">
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
                      {message.answer.source ? `출처 · ${message.answer.source}` : "교재 출처 없음"}
                    </span>
                    <div className="listen-row">
                      <Listen text={message.answer.ko} />
                      <span>듣기</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ),
        )}
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
      <Modal open={endOpen} onClose={() => setEndOpen(false)} label="대화를 종료할까요?">
        <Art name="robot-face" width={96} />
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>대화를 종료할까요?</h2>
        <span className="vi" style={{ fontSize: 13, marginTop: -6 }}>
          Bạn có muốn kết thúc cuộc trò chuyện?
        </span>
        <p style={{ fontSize: 14 }}>현재 대화 내용은 저장되지 않아요.</p>
        <span className="vi" style={{ fontSize: 12, marginTop: -6 }}>
          Nội dung trò chuyện hiện tại sẽ không được lưu.
        </span>
        <div className="btn-row" style={{ width: "100%" }}>
          <button type="button" className="btn btn-outline" onClick={() => setEndOpen(false)}>
            <BtnLabel ko="계속 대화하기" vi="Tiếp tục" />
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setMessages([]);
              setEndOpen(false);
            }}
          >
            <BtnLabel ko="종료하기" vi="Kết thúc" />
          </button>
        </div>
      </Modal>
    </MobileScreen>
  );
}
