"use client";

// Mock 데이터를 브라우저(localStorage)에 두고 화면 전체가 나눠 쓴다.
// 같은 브라우저의 다른 탭과도 맞춘다(작성자 탭에서 보내면 담당자 탭에 보임).
// 실제 API가 붙으면 이 공급자만 Supabase·서버 호출로 바꾼다.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useState,
} from "react";

import { createDemoDb, DB_STORAGE_KEY, type DemoDb, kstToday } from "@/lib/demo/store";

type DemoContext = {
  db: DemoDb;
  today: string;
  update: (change: (db: DemoDb) => DemoDb) => void;
  reset: () => void;
};

const Ctx = createContext<DemoContext | null>(null);

function load(today: string): DemoDb {
  try {
    const saved = window.localStorage.getItem(DB_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DemoDb;
      // 날짜가 바뀌면 ‘오늘’ 기준 시드가 어긋나므로 새로 만든다(시연용).
      if (parsed?.version === 2 && parsed.seededOn === today && parsed.records) return parsed;
    }
  } catch {
    /* 손상된 시연 데이터는 새로 만든다 */
  }
  return createDemoDb(today);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ db: DemoDb; today: string } | null>(null);

  useEffect(() => {
    // 서버 렌더와 첫 화면을 맞추려고 마운트 뒤에 읽는다.
    const frame = window.requestAnimationFrame(() => {
      const today = kstToday();
      setState({ db: load(today), today });
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DB_STORAGE_KEY || !event.newValue) return;
      try {
        const db = JSON.parse(event.newValue) as DemoDb;
        setState((prev) => (prev ? { ...prev, db } : prev));
      } catch {
        /* 무시 */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state.db));
    } catch {
      /* 저장 공간이 막힌 브라우저에서는 이 탭에서만 유지 */
    }
  }, [state]);

  const update = useCallback((change: (db: DemoDb) => DemoDb) => {
    setState((prev) => (prev ? { ...prev, db: change(prev.db) } : prev));
  }, []);

  const reset = useCallback(() => {
    const today = kstToday();
    setState({ db: createDemoDb(today), today });
  }, []);

  const value = useMemo(
    () => (state ? { db: state.db, today: state.today, update, reset } : null),
    [state, update, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const subscribeNothing = () => () => {};

/** 데이터를 읽기 전에는 null. 화면은 null이면 빈 틀만 보인다.
 *  화면 조각이 늦게 하이드레이션돼도(부분 사전 렌더) 첫 렌더는 서버와 같게 null을 준다. */
export function useDemo(): DemoContext | null {
  const value = useContext(Ctx);
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  return hydrated ? value : null;
}

export function nowIso() {
  return new Date().toISOString();
}
