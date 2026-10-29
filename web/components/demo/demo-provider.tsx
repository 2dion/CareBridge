"use client";

// 화면 전체가 나눠 쓰는 데이터 공급자.
// - 실제 모드(Supabase 설정이 있음): 로그인한 사람 권한(RLS)으로 읽고, 바꾸는 일은 서버 API·Supabase로 한다(real).
// - Mock 모드(Supabase 설정이 없는 로컬 개발): 브라우저(localStorage)에 두고 같은 브라우저의 다른 탭과 맞춘다.
// 로그인과 같은 기준(supabaseConfigured)으로 가른다.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  useState,
} from "react";

import { supabaseConfigured } from "@/lib/auth/session";
import { type RoleNames, roleNames } from "@/lib/demo/roles";
import {
  createDemoDb,
  DB_STORAGE_KEY,
  type DemoDb,
  type DemoRecord,
  kstToday,
} from "@/lib/demo/store";
import { createRealActions, type RealActions } from "@/lib/real/actions";
import { loadRealDb, NotSignedInError } from "@/lib/real/load";
import type { JoinCode } from "@/lib/real/map";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type RealContext = {
  actions: RealActions;
  role: "worker" | "reviewer";
  userId: string;
  isTraining: boolean;
  nativeLang: "ko" | "vi";
  /** M5 설정: 내 기관의 켜진 가입 코드(관리자만 읽음, 작성자는 빈 목록) */
  joinCodes: JoinCode[];
  /** 서버·DB에서 다시 읽는다 */
  reload: () => Promise<void>;
};

type DemoContext = {
  db: DemoDb;
  today: string;
  /** Mock 모드에서만 쓴다. 실제 모드에서는 real.actions를 쓴다 */
  update: (change: (db: DemoDb) => DemoDb) => void;
  reset: () => void;
  /** 실제 모드면 값이 있다 */
  real: RealContext | null;
};

const Ctx = createContext<DemoContext | null>(null);

const AUTH_PATHS = ["/login", "/signup"];
let loadSeq = 0;

function load(today: string): DemoDb {
  try {
    const saved = window.localStorage.getItem(DB_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DemoDb;
      // 날짜가 바뀌면 ‘오늘’ 기준 시드가 어긋나므로 새로 만든다(시연용).
      // version 4(10/29): 이력 줄에 actor_role이 붙어, 옛 시연 데이터는 새로 만든다
      if (parsed?.version === 4 && parsed.seededOn === today && parsed.records) return parsed;
    }
  } catch {
    /* 손상된 시연 데이터는 새로 만든다 */
  }
  return createDemoDb(today);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  return supabaseConfigured() ? (
    <RealProvider>{children}</RealProvider>
  ) : (
    <MockProvider>{children}</MockProvider>
  );
}

function RealProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    db: DemoDb;
    today: string;
    role: RealContext["role"];
    userId: string;
    isTraining: boolean;
    nativeLang: "ko" | "vi";
    joinCodes: JoinCode[];
  } | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const reload = useCallback(async () => {
    // 늦게 끝난 옛 읽기가 새 읽기를 덮지 않게 마지막 요청만 반영한다
    const seq = ++loadSeq;
    const today = kstToday();
    try {
      const next = await loadRealDb(supabase, today);
      if (seq === loadSeq) setState({ today, ...next });
    } catch (error) {
      if (error instanceof NotSignedInError) {
        setState(null);
        if (!AUTH_PATHS.some((path) => window.location.pathname.startsWith(path))) {
          window.location.replace("/login");
        }
        return;
      }
      throw error;
    }
  }, [supabase]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void reload();
    });
    // 로그인·로그아웃하면 그 사람의 데이터로 다시 읽는다
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void reload();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      data.subscription.unsubscribe();
    };
  }, [reload, supabase]);

  // 정리 중(받아쓰기·Agent)인 기록이 있으면 끝날 때까지 3초마다 다시 읽는다
  const processing = state
    ? Object.values(state.db.records).some((record) => record.draftState === "processing")
    : false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
  }, [processing, reload]);

  // [글로 쓰기]·[다시 시도]의 Agent는 요청 하나로 돈다. 도는 동안은 '정리 중', 실패하면 '초안 실패'로 보인다.
  // [글로 쓰기]는 서버가 다시 읽히기 전에도 입력 방법을 '글'로 보여, '정리 중'에 음성 단계가 나오지 않게 한다(이슈 #135)
  type Running = { draftState: "processing" | "failed"; inputMode?: DemoRecord["inputMode"] };
  const [running, setRunning] = useState<Record<string, Running>>({});
  const base = useMemo(() => createRealActions(supabase, reload), [supabase, reload]);
  const actions = useMemo<RealActions>(() => {
    const track = async (
      id: string,
      run: () => ReturnType<RealActions["retryDraft"]>,
      inputMode?: DemoRecord["inputMode"],
    ) => {
      setRunning((prev) => ({ ...prev, [id]: { draftState: "processing", inputMode } }));
      const result = await run();
      setRunning((prev) => {
        const next = { ...prev };
        if (result.ok) delete next[id];
        else next[id] = { draftState: "failed", inputMode };
        return next;
      });
      return result;
    };
    return {
      ...base,
      writeText: (id, text) => track(id, () => base.writeText(id, text), "text"),
      retryDraft: (id) => track(id, () => base.retryDraft(id)),
    };
  }, [base]);
  // 수정 필요인 내 기록에 모국어 번역이 비어 있으면 서버에 한 번 번역을 부탁하고 다시 읽는다(결정 2026-10-28-되돌림사유번역).
  // 관리자는 한국어만 저장하고, 번역은 작성자 쪽에서 채운다. 기록마다 한 번만 부른다(Mock이면 빈칸이라 반복하지 않게).
  const translated = useRef(new Set<string>());
  useEffect(() => {
    if (!state || state.role !== "worker" || state.nativeLang === "ko") return;
    const ids = Object.values(state.db.records)
      .filter(
        (record) =>
          record.status === "returned" &&
          record.returnReason &&
          !record.returnReasonNative &&
          !translated.current.has(record.id),
      )
      .map((record) => record.id);
    if (ids.length === 0) return;
    ids.forEach((id) => translated.current.add(id));
    void Promise.all(ids.map((id) => base.translateReturnReason(id))).then(() => reload());
  }, [state, base, reload]);

  const db = useMemo(() => {
    if (!state) return null;
    const ids = Object.keys(running).filter((id) => state.db.records[id]);
    if (ids.length === 0) return state.db;
    const records = { ...state.db.records };
    for (const id of ids) {
      const { draftState, inputMode } = running[id];
      records[id] = { ...records[id], draftState, ...(inputMode ? { inputMode } : {}) };
    }
    return { ...state.db, records };
  }, [state, running]);
  const noop = useCallback(() => {}, []);

  const value = useMemo<DemoContext | null>(
    () =>
      state && db
        ? {
            db,
            today: state.today,
            update: noop,
            reset: noop,
            real: {
              actions,
              role: state.role,
              userId: state.userId,
              isTraining: state.isTraining,
              nativeLang: state.nativeLang,
              joinCodes: state.joinCodes,
              reload,
            },
          }
        : null,
    [state, db, actions, reload, noop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function MockProvider({ children }: { children: ReactNode }) {
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
    () => (state ? { db: state.db, today: state.today, update, reset, real: null } : null),
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

/** 화면에 보일 역할 이름. 교육용 기관(실제 모드 is_training)이면 교육생·강사, 그 밖(Mock 포함)은 작성자·관리자(이슈 #125) */
export function useRoleNames(): RoleNames {
  const demo = useDemo();
  return roleNames(Boolean(demo?.real?.isTraining));
}

export function nowIso() {
  return new Date().toISOString();
}
