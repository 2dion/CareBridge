"use client";

// 작성자 화면에서 여러 번 쓰는 작은 조각: 버튼 글자, 듣기 버튼, 확인 창.
import { type ReactNode, useEffect } from "react";

import { SHOW_FRAME_NATIVE } from "@/lib/bilingual";
import { nativeMessage, type MessageId } from "@/lib/i18n/messages";
import { speakKorean } from "@/lib/speech";
import { useNativeLanguage } from "./native";

import { Icon } from "./icon";

/** 버튼 글자. 버튼은 화면 틀이라 병기 원칙이면 한국어만, 예외 화면은 always. */
export function BtnLabel({
  ko,
  native,
  always,
  nativeId,
}: {
  ko: string;
  native?: string;
  always?: boolean;
  nativeId?: MessageId;
}) {
  const lang = useNativeLanguage();
  const translation = nativeId ? nativeMessage(always ? "vi" : lang, nativeId) : native;
  if (translation && (always || (SHOW_FRAME_NATIVE && lang !== "ko"))) {
    return (
      <span className="label two">
        <b>{ko}</b>
        <small lang={always ? "vi" : lang}>{translation}</small>
      </span>
    );
  }
  return <span className="label">{ko}</span>;
}

/** 한국어 문장 옆 🔊 듣기(브라우저 음성, 화면 v1.3 공통 규칙). */
export function Listen({ text }: { text: string }) {
  useEffect(() => {
    // 일부 브라우저는 처음 요청한 뒤 목소리 목록을 비동기로 준비한다.
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);
  if (!text.trim()) return null;
  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speakKorean(text, window.speechSynthesis);
  };
  return (
    <button type="button" className="listen" onClick={speak} aria-label="듣기">
      <Icon name="volume" />
    </button>
  );
}

/** 가운데 확인 창. Esc로 닫는다. */
export function Modal({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="dim" onClick={onClose} aria-hidden="true" />
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ alignItems: "center", textAlign: "center" }}
      >
        {children}
      </section>
    </>
  );
}

/** 아래에서 올라오는 창(기록 없음 처리 등). */
export function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="dim" onClick={onClose} aria-hidden="true" />
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={label}>
        <span className="grabber" />
        {children}
      </section>
    </>
  );
}
