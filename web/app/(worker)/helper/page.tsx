"use client";

import { Native, useNativeLanguage } from "@/components/mobile/native";

import { nativeMessage } from "@/lib/i18n/messages";

// W6(도우미): 교재 근거 질문·답. 기록을 대신 쓰거나 고치지 않는다.
// 답변은 남이 쓴 내용이라 병기(원칙 ②), 내 질문은 그대로(①).
// 대화는 서버(helper_messages)에 남기고, 열 때 GET /api/helper/messages로 지난 대화를 불러와 이어 보인다(이슈 #218).
// 실제 모드는 브라우저 저장을 쓰지 않는다. Supabase 설정이 없는 Mock만 계정별로 이 브라우저 안에 남긴다(이슈 #152, lib/helper/history.ts).
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Fragment, useCallback, useEffect, useRef, useState } from "react";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel, Listen, Modal } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen } from "@/components/mobile/shell";
import { TextInput } from "@/components/mobile/text-field";
import { DEFAULT_NATIVE_LANG } from "@/lib/i18n/languages";
import { helperSuggestions, mockHelperAnswer } from "@/lib/demo/helper";
import { kstDateOf, kstTime, monthDayWeek } from "@/lib/demo/store";
import {
  browserStorage,
  clearHelperHistory,
  type LoadingMessage,
  loadMockConversations,
  deleteMockConversation,
  MOCK_HELPER_USER,
  saveMockConversation,
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
  const search = useSearchParams();
  if (!demo) return <Loading tab="helper" />;
  const userId = demo.real?.userId ?? MOCK_HELPER_USER;
  const selected = search.get("conversation");
  const fresh = search.get("new") === "1";
  return (
    <HelperChat
      key={`${userId}:${selected ?? ""}:${fresh}`}
      userId={userId}
      selected={selected}
      fresh={fresh}
    />
  );
}

function HelperChat({
  userId,
  selected,
  fresh,
}: {
  userId: string;
  selected: string | null;
  fresh: boolean;
}) {
  const nativeLanguage = useNativeLanguage();
  const demo = useDemo()!;
  const search = useSearchParams();
  const router = useRouter();
  const real = demo.real;
  const actions = real?.actions;
  const [initial] = useState(() => {
    if (real || fresh)
      return { messages: [] as Message[], id: fresh ? null : selected, missing: false };
    const conversations = loadMockConversations(browserStorage(), userId);
    const chosen = selected ? conversations.find((row) => row.id === selected) : conversations[0];
    return {
      messages: chosen?.messages.slice(-100) ?? [],
      id: chosen?.id ?? null,
      missing: Boolean(selected && !chosen),
    };
  });
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [conversationId, setConversationId] = useState<string | null>(initial.id);
  const names = useRoleNames();
  const [text, setText] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [history, setHistory] = useState<"loading" | "done" | "error">(
    real && !fresh ? "loading" : initial.missing ? "error" : "done",
  );
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const sending = useRef(false);
  const nextId = useRef(messages.reduce((max, row) => Math.max(max, row.id), 0) + 1);
  const bottom = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(() => {
    if (fresh) return;
    const sequence = ++request.current;
    if (!actions) {
      void Promise.resolve().then(() => {
        if (sequence !== request.current) return;
        const conversations = loadMockConversations(browserStorage(), userId);
        const chosen = selected
          ? conversations.find((row) => row.id === selected)
          : conversations[0];
        const past = chosen?.messages.slice(-100) ?? [];
        nextId.current = past.reduce((max, row) => Math.max(max, row.id), 0) + 1;
        setMessages(past);
        setConversationId(chosen?.id ?? null);
        setHistory(selected && !chosen ? "error" : "done");
      });
      return;
    }
    void actions.helperMessages(undefined, selected).then((result) => {
      if (sequence !== request.current) return;
      if (!result.ok) {
        setHistory("error");
        return;
      }
      const past: Message[] = result.data.messages.flatMap((row, index) => [
        { id: index * 2 + 1, from: "me" as const, text: row.question, at: row.created_at },
        { id: index * 2 + 2, from: "bot" as const, state: "done" as const, answer: row.answer },
      ]);
      nextId.current = past.length + 1;
      setConversationId(result.data.conversation?.id ?? null);
      setMessages(past);
      setHistory("done");
    });
  }, [actions, fresh, selected, userId]);

  useEffect(() => {
    if (actions) {
      clearHelperHistory(browserStorage(), userId);
      loadHistory();
    }
    return () => {
      request.current += 1;
    };
  }, [actions, userId, loadHistory]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  const { today } = demo;
  const ask = async (question: string, replaceId?: number) => {
    const q = question.trim();
    if (!q || q.length > 500 || sending.current || history === "loading") return;
    sending.current = true;
    setBusy(true);
    const sequence = ++request.current;
    const botId = replaceId ?? nextId.current + 1;
    const loading: LoadingMessage = { id: botId, from: "bot", state: "loading", question: q };
    const pending: Message[] =
      replaceId === undefined
        ? [
            ...messages,
            { id: nextId.current, from: "me", text: q, at: new Date().toISOString() },
            loading,
          ]
        : messages.map((message) => (message.id === replaceId ? loading : message));
    if (replaceId === undefined) {
      nextId.current += 2;
      setText("");
    }
    setMessages(pending);
    try {
      let reply: Message;
      let id = conversationId;
      let saved = false;
      if (actions) {
        const result = await actions.askHelper(q, conversationId);
        if (sequence !== request.current) return;
        if (result.ok && result.data.conversation_id) id = result.data.conversation_id;
        saved = result.ok && Boolean(result.data.id && result.data.conversation_id);
        reply = result.ok
          ? {
              id: botId,
              from: "bot",
              state: "done",
              answer: { ...result.data, nativeLang: nativeLanguage },
            }
          : { id: botId, from: "bot", state: "error", question: q };
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        if (sequence !== request.current) return;
        const failed = !navigator.onLine || search.get("demo") === "error";
        reply = failed
          ? { id: botId, from: "bot", state: "error", question: q }
          : { id: botId, from: "bot", state: "done", answer: mockHelperAnswer(q, nativeLanguage) };
        if (!failed) id ??= crypto.randomUUID();
      }
      const completed = pending.map((message) => (message.id === botId ? reply : message));
      setMessages(completed);
      setConversationId(id);
      if (!actions && id) saved = saveMockConversation(browserStorage(), userId, id, completed);
      if (saved && id && (fresh || selected !== id)) {
        router.replace(`/helper?conversation=${encodeURIComponent(id)}`, { scroll: false });
      }
    } finally {
      sending.current = false;
      if (sequence === request.current) setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(text);
  };

  const startNew = () => {
    request.current += 1;
    setMessages([]);
    setConversationId(null);
    setHistory("done");
    setText("");
    nextId.current = 1;
    router.replace("/helper?new=1", { scroll: false });
  };
  const clearConversation = () => {
    if (conversationId) deleteMockConversation(browserStorage(), userId, conversationId);
    setClearOpen(false);
    startNew();
  };

  const rows = withDayLabels(messages, today);

  return (
    <MobileScreen tab="helper" className="helper-screen">
      <AppBar
        title="도우미"
        native={nativeMessage(nativeLanguage, "w6.title")}
        right={
          // 서버 기록은 작성자가 지우지 않으므로 실제 모드에서는 숨긴다. Mock 데모만 있다
          !real && messages.length > 0 ? (
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => setClearOpen(true)}
            >
              대화 지우기
              <Native className="native" style={{ display: "block", fontSize: 11 }}>
                {nativeMessage(nativeLanguage, "w6.clearTitle")}
              </Native>
            </button>
          ) : undefined
        }
      />
      <div className="helper-actions">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy || (messages.length === 0 && history === "done")}
          onClick={startNew}
        >
          <Icon name="write" />
          <BtnLabel ko="새 대화" native={nativeMessage(nativeLanguage, "w6.newConversation")} />
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() =>
            router.push(
              `/helper/history${conversationId ? `?current=${encodeURIComponent(conversationId)}` : "?new=1"}`,
            )
          }
        >
          <Icon name="list" />
          <BtnLabel
            ko="이전 대화"
            native={nativeMessage(nativeLanguage, "w6.previousConversations")}
          />
        </button>
      </div>
      <div className="reason-box big helper-notice" role="note">
        <b>건강·안전 문제는 {names.reviewer}에게 먼저 보고하세요.</b>
        <Native className="native" requiredIds={["w6.safetyHint"]}>
          {nativeMessage(nativeLanguage, "w6.safetyHint")}
          {names.reviewerNative}.
        </Native>
        <span>
          질문과 답은 서버에 저장돼 나중에 다시 볼 수 있어요. 어르신·가족 실명은 쓰지 마세요.
        </span>
        <Native className="native" requiredIds={["w6.savedHint"]}>
          {nativeMessage(nativeLanguage, "w6.savedHint")}
        </Native>
      </div>
      <div className="chat" aria-live="polite">
        {history === "loading" && (
          <p role="status">
            지난 대화를 불러오는 중이에요.
            <Native className="native">{nativeMessage(nativeLanguage, "w6.loading")}</Native>
          </p>
        )}
        {history === "error" && (
          <div className="form-error box" role="alert">
            <Icon name="alert" />
            <div>
              <b>지난 대화를 불러오지 못했어요.</b>
              <Native className="native">{nativeMessage(nativeLanguage, "w6.loadError")}</Native>
              <button
                disabled={busy}
                type="button"
                className="text-link"
                onClick={() => {
                  setHistory("loading");
                  loadHistory();
                }}
              >
                다시 불러오기
                <Native className="native" style={{ display: "block", fontSize: 11 }}>
                  {nativeMessage(nativeLanguage, "w6.reload")}
                </Native>
              </button>
            </div>
          </div>
        )}
        {messages.length === 0 && history !== "loading" && (
          <div className="stack" style={{ alignItems: "center", gap: 8, marginTop: 24 }}>
            <Art name="robot-face" width={120} />
            <p style={{ fontSize: 16, fontWeight: 700 }}>일하다 막히면 물어보세요.</p>
            <Native className="native">{nativeMessage(nativeLanguage, "w6.welcome")}</Native>
            <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
              교재에 있는 내용으로만 답해요. 기록은 대신 써 주지 않아요.
            </p>
            <Native className="native" style={{ fontSize: 12 }}>
              {nativeMessage(nativeLanguage, "w6.scopeHint")}
            </Native>
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
                      <Native className="native">
                        {nativeMessage(nativeLanguage, "w6.answerError")}
                      </Native>
                      <p style={{ fontSize: 13 }}>네트워크를 확인하고 다시 시도해 주세요.</p>
                      <Native className="native">
                        {nativeMessage(nativeLanguage, "w6.networkHint")}
                      </Native>
                      <button
                        type="button"
                        className="btn btn-soft btn-center btn-sm"
                        disabled={busy}
                        onClick={() => void ask(message.question, message.id)}
                      >
                        <Icon name="refresh" />
                        <BtnLabel
                          ko="다시 시도"
                          native={nativeMessage(nativeLanguage, "w6.retry")}
                        />
                      </button>
                    </div>
                  )}
                  {message.state === "done" && (
                    <>
                      <p>{message.answer.ko}</p>
                      <Native
                        className="native"
                        recordLanguage={message.answer.nativeLang ?? DEFAULT_NATIVE_LANG}
                      >
                        {message.answer.native}
                      </Native>
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
            maxLength={500}
            disabled={busy || history === "loading"}
            className="input"
            value={text}
            onValueChange={setText}
            placeholder="궁금한 내용을 입력하세요."
            autoComplete="off"
          />
          <button
            type="submit"
            className="send"
            aria-label="질문하기"
            disabled={busy || history === "loading" || !text.trim()}
          >
            <Icon name="send" />
          </button>
        </form>
      </div>
      <Modal open={clearOpen} onClose={() => setClearOpen(false)} label="대화를 지울까요?">
        <Art name="robot-face" width={96} />
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>대화를 지울까요?</h2>
        <Native className="native" style={{ fontSize: 13, marginTop: -6 }}>
          {nativeMessage(nativeLanguage, "w6.clearQuestion")}
        </Native>
        <p style={{ fontSize: 14 }}>지금 보고 있는 대화만 이 휴대폰에서 지워져요.</p>
        <Native className="native" style={{ fontSize: 12, marginTop: -6 }}>
          {nativeMessage(nativeLanguage, "w6.clearDescription")}
        </Native>
        <div className="btn-row" style={{ width: "100%" }}>
          <button type="button" className="btn btn-outline" onClick={() => setClearOpen(false)}>
            <BtnLabel ko="계속 대화하기" native={nativeMessage(nativeLanguage, "w6.continue")} />
          </button>
          <button type="button" className="btn btn-primary" onClick={clearConversation}>
            <BtnLabel ko="지우기" native={nativeMessage(nativeLanguage, "w6.clear")} />
          </button>
        </div>
      </Modal>
    </MobileScreen>
  );
}
