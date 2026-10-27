"use client";

// 녹음: 시작·정지 버튼으로 직접, 최대 5분에 자동 정지(10/19 결정).
// 녹음은 탭 메모리에만 둔다. 기기 저장 공간(IndexedDB·localStorage)에 쓰지 않는다(2026-10-27-녹음임시보관 결정).
import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_SECONDS = 300;

export type RecorderState = "idle" | "asking" | "recording" | "stopped" | "denied" | "unsupported";

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  // 마이크 권한을 묻는 사이 화면을 떠났으면 늦게 시작하지 않게 한다.
  const sessionRef = useRef(0);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopTracks();
    setState((prev) => (prev === "recording" ? "stopped" : prev));
  }, []);

  const start = useCallback(async () => {
    const session = ++sessionRef.current;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      return;
    }
    setState("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mime = ["audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      blobRef.current = null;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        stopTracks();
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setState("recording");
    } catch {
      if (session === sessionRef.current) setState("denied");
    }
  }, []);

  /** [삭제]·받아쓰기 성공·로그아웃 때 메모리의 녹음을 지운다. */
  const discard = useCallback(() => {
    sessionRef.current += 1;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopTracks();
    chunksRef.current = [];
    blobRef.current = null;
    setSeconds(0);
    setState("idle");
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "recording" || seconds < MAX_SECONDS) return;
    const frame = window.requestAnimationFrame(stop);
    return () => window.cancelAnimationFrame(frame);
  }, [seconds, state, stop]);

  // 녹음 중이거나 보내지 못한 녹음이 있으면 탭 닫기 경고.
  useEffect(() => {
    if (state !== "recording" && state !== "stopped") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopTracks();
    },
    [],
  );

  return { state, seconds, start, stop, discard, blob: () => blobRef.current };
}

export function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
