"use client";

// 작성자 화면에서 여러 번 쓰는 작은 조각: 버튼 글자, 듣기 버튼, 확인 창.
import { type ReactNode, useEffect } from "react";

import { SHOW_FRAME_VI } from "@/lib/bilingual";

import { Icon } from "./icon";

/** 버튼 글자. 버튼은 화면 틀이라 병기 원칙이면 한국어만, 예외 화면은 always. */
export function BtnLabel({ ko, vi, always }: { ko: string; vi?: string; always?: boolean }) {
  if (vi && (always || SHOW_FRAME_VI)) {
    return (
      <span className="label two">
        <b>{ko}</b>
        <small>{vi}</small>
      </span>
    );
  }
  return <span className="label">{ko}</span>;
}

/** 한국어 문장 옆 🔊 듣기(브라우저 음성, 화면 v1.3 공통 규칙). */
export function Listen({ text }: { text: string }) {
  if (!text.trim()) return null;
  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };
  return (
    <button type="button" className="listen" onClick={speak} aria-label="듣기">
      <Icon name="volume" />
    </button>
  );
}

/** 가운데 확인 창(피그마 M16). Esc로 닫는다. */
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
