"use client";

// 화면 전체가 나눠 쓰는 데이터 공급자.
// - 실제 모드(Supabase 설정이 있음): 로그인한 사람 권한(RLS)으로 읽고, 바꾸는 일은 서버 API·Supabase로 한다(real).
// - Mock 모드(Supabase 설정이 없는 로컬 개발): 브라우저(localStorage)에 두고 같은 브라우저의 다른 탭과 맞춘다.
// 로그인과 같은 기준(supabaseConfigured)으로 가른다.
import type { NativeLang } from "@/lib/auth/signup";
import type { ItemKey } from "@/lib/demo/state";
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
import { splashRemaining } from "@/lib/auth/splash";
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
import { itemsSnapshot, type JoinCode, textRunStateOf } from "@/lib/real/map";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type RealContext = {
  actions: RealActions;
  role: "worker" | "reviewer";
  userId: string;
  isTraining: boolean;
  nativeLang: NativeLang;
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
      // version 5(10/30): 어르신 이름·사진 구조로 바뀌어 옛 시연 데이터는 새로 만든다
      if (parsed?.version === 5 && parsed.seededOn === today && parsed.records) return parsed;
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

// [글로 쓰기]·[다시 시도]는 요청 하나로 돌아 새로고침하면 화면이 '정리 중'을 잊는다.
// 이 탭에 시작 시각을 남기고, 실패는 시작 시각 0으로 남겨 새로고침해도 실패로 보인다(이슈 #237)
const DRAFT_RUNS_KEY = "carebridge.draft-runs";
type DraftRun = { startedAt: number; snapshot: string; inputMode?: DemoRecord["inputMode"] };

function readDraftRuns(): Record<string, DraftRun> {
  try {
    return JSON.parse(window.sessionStorage.getItem(DRAFT_RUNS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveDraftRuns(runs: Record<string, DraftRun>) {
  try {
    window.sessionStorage.setItem(DRAFT_RUNS_KEY, JSON.stringify(runs));
  } catch {
    // 저장이 막혀도 요청이 도는 동안은 running으로 '정리 중'을 보인다
  }
}

function RealProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    db: DemoDb;
    loadedAt: number;
    today: string;
    role: RealContext["role"];
    userId: string;
    isTraining: boolean;
    nativeLang: NativeLang;
    joinCodes: JoinCode[];
  } | null>(null);
  const [draftRuns, setDraftRuns] = useState<Record<string, DraftRun>>(() =>
    typeof window === "undefined" ? {} : readDraftRuns(),
  );
  const loaded = useRef(state);
  useEffect(() => {
    loaded.current = state;
  }, [state]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const reload = useCallback(async () => {
    // 늦게 끝난 옛 읽기가 새 읽기를 덮지 않게 마지막 요청만 반영한다
    const seq = ++loadSeq;
    const today = kstToday();
    try {
      const next = await loadRealDb(supabase, today);
      if (seq === loadSeq) {
        const loadedAt = Date.now();
        setState({ today, loadedAt, ...next });
        setDraftRuns((prev) => {
          const kept = Object.fromEntries(
            Object.entries(prev).filter(([id, run]) => {
              const record = next.db.records[id];
              return record && textRunStateOf(record.items, run, loadedAt) !== null;
            }),
          );
          saveDraftRuns(kept);
          return kept;
        });
      }
    } catch (error) {
      if (error instanceof NotSignedInError) {
        setState(null);
        const path = window.location.pathname;
        if (path === "/") {
          // A0(스플래시): 스플래시 시간이 남았으면 그만큼 보인 뒤 A1(로그인)으로 보낸다(이슈 #111).
          // 그 사이 사용자가 눌러서 이미 다른 화면으로 갔으면 보내지 않는다
          window.setTimeout(() => {
            if (window.location.pathname === "/") window.location.replace("/login");
          }, splashRemaining());
        } else if (!AUTH_PATHS.some((prefix) => path.startsWith(prefix))) {
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

  // [글로 쓰기]·[다시 시도]의 Agent는 요청 하나로 돈다. 도는 동안은 '정리 중', 실패하면 '초안 실패'로 보인다.
  // [글로 쓰기]는 서버가 다시 읽히기 전에도 입력 방법을 '글'로 보여, '정리 중'에 음성 단계가 나오지 않게 한다(이슈 #135)
  type Running = { draftState: "processing" | "failed"; inputMode?: DemoRecord["inputMode"] };
  const [running, setRunning] = useState<Record<string, Running>>({});
  const reflectConfirmation = useCallback((recordId: string, key: ItemKey) => {
    setState((prev) => {
      const record = prev?.db.records[recordId];
      if (!prev || !record) return prev;
      return {
        ...prev,
        db: {
          ...prev.db,
          records: {
            ...prev.db.records,
            [recordId]: {
              ...record,
              items: record.items.map((item) =>
                item.item_key === key ? { ...item, confirmed_by_worker: true } : item,
              ),
            },
          },
        },
      };
    });
  }, []);
  const base = useMemo(
    () => createRealActions(supabase, reload, { onConfirmed: reflectConfirmation }),
    [supabase, reload, reflectConfirmation],
  );
  const actions = useMemo<RealActions>(() => {
    const remember = (id: string, run: DraftRun | null) => {
      setDraftRuns((prev) => {
        const next = { ...prev };
        if (run) next[id] = run;
        else delete next[id];
        saveDraftRuns(next);
        return next;
      });
    };
    const track = async (
      id: string,
      run: () => ReturnType<RealActions["retryDraft"]>,
      inputMode?: DemoRecord["inputMode"],
    ) => {
      setRunning((prev) => ({ ...prev, [id]: { draftState: "processing", inputMode } }));
      const snapshot = itemsSnapshot(loaded.current?.db.records[id]?.items ?? []);
      remember(id, { startedAt: Date.now(), snapshot, inputMode });
      const result = await run();
      remember(id, result.ok ? null : { startedAt: 0, snapshot, inputMode });
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
      // 새 녹음은 audio_jobs가 상태를 맡는다. 앞선 실패 기록이 '정리 중'을 덮지 않게 지운다
      sendVoice: async (id, blob) => {
        const result = await base.sendVoice(id, blob);
        if (result.ok) {
          remember(id, null);
          setRunning((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
        return result;
      },
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
    const records = { ...state.db.records };
    for (const [id, run] of Object.entries(draftRuns)) {
      const draftState = records[id] && textRunStateOf(records[id].items, run, state.loadedAt);
      if (draftState) {
        records[id] = {
          ...records[id],
          draftState,
          ...(run.inputMode ? { inputMode: run.inputMode } : {}),
        };
      }
    }
    for (const [id, { draftState, inputMode }] of Object.entries(running)) {
      if (!records[id]) continue;
      records[id] = { ...records[id], draftState, ...(inputMode ? { inputMode } : {}) };
    }
    return { ...state.db, records };
  }, [state, running, draftRuns]);

  // 정리 중(받아쓰기·Agent)인 기록이 있으면 끝날 때까지 3초마다 다시 읽는다
  const processing = db
    ? Object.values(db.records).some((record) => record.draftState === "processing")
    : false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
  }, [processing, reload]);

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
