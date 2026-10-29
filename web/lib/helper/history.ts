// W6(도우미) 대화를 브라우저 저장소에만 남긴다(이슈 #152, 10/29 멘토링).
// 서버에 저장하지 않으므로 새 표·API가 없다(데이터 구조 '대화 미저장' 그대로).
// 로그인한 계정별 키, 최근 HELPER_HISTORY_LIMIT개, 로그아웃이나 [대화 지우기]로 지운다.
// 저장소가 막힌 브라우저(사생활 보호 모드 등)에서도 화면이 멈추지 않게 접근은 모두 try/catch로 감싼다.
import type { HelperAnswer } from "@/lib/demo/helper";

export const HELPER_HISTORY_PREFIX = "carebridge-helper-";
export const HELPER_HISTORY_LIMIT = 50;
/** Mock(Supabase 설정 없음)은 계정 id가 없어 고정 값을 쓴다 */
export const MOCK_HELPER_USER = "mock-worker";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** 저장하는 말풍선. 답을 기다리는 중(loading)은 저장하지 않고 실패로 바꿔 둔다(다시 시도 가능) */
export type StoredMessage =
  | { id: number; from: "me"; text: string; at: string }
  | { id: number; from: "bot"; state: "error"; question: string }
  | { id: number; from: "bot"; state: "done"; answer: HelperAnswer };

export type LoadingMessage = { id: number; from: "bot"; state: "loading"; question: string };

export function helperHistoryKey(userId: string): string {
  return `${HELPER_HISTORY_PREFIX}${userId}`;
}

/** window.localStorage. 접근 자체가 막힌 브라우저면 undefined */
export function browserStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** 화면 상태 → 저장 모양: 기다리던 답은 실패로(다시 시도 버튼이 보이게) */
export function forStorage(messages: Array<StoredMessage | LoadingMessage>): StoredMessage[] {
  return messages.map((message) =>
    message.from === "bot" && message.state === "loading"
      ? { id: message.id, from: "bot", state: "error", question: message.question }
      : message,
  );
}

/** 최근 limit개만. 잘린 자리가 답이면 질문과 짝이 맞게 하나 더 뺀다 */
export function trimHistory(
  messages: StoredMessage[],
  limit = HELPER_HISTORY_LIMIT,
): StoredMessage[] {
  let rows = messages.slice(Math.max(0, messages.length - limit));
  if (rows.length > 0 && rows[0].from === "bot") rows = rows.slice(1);
  return rows;
}

export function loadHelperHistory(
  storage: StorageLike | undefined,
  userId: string,
): StoredMessage[] {
  try {
    const raw = storage?.getItem(helperHistoryKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredMessage);
  } catch {
    return [];
  }
}

export function saveHelperHistory(
  storage: StorageLike | undefined,
  userId: string,
  messages: Array<StoredMessage | LoadingMessage>,
): void {
  try {
    const rows = trimHistory(forStorage(messages));
    const key = helperHistoryKey(userId);
    if (rows.length === 0) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(rows));
  } catch {
    /* 저장이 막혀도 대화는 화면에 그대로 둔다 */
  }
}

/** [대화 지우기]: 이 계정의 대화만 */
export function clearHelperHistory(storage: StorageLike | undefined, userId: string): void {
  try {
    storage?.removeItem(helperHistoryKey(userId));
  } catch {
    /* 무시 */
  }
}

/** 로그아웃: 이 브라우저에 남은 모든 계정의 대화를 지운다(같은 기기를 여럿이 쓸 수 있음) */
export function clearAllHelperHistory(storage: StorageLike | undefined): void {
  try {
    if (!storage) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(HELPER_HISTORY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    /* 무시 */
  }
}

function isStoredMessage(value: unknown): value is StoredMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "number") return false;
  if (row.from === "me") return typeof row.text === "string" && typeof row.at === "string";
  if (row.from !== "bot") return false;
  if (row.state === "error") return typeof row.question === "string";
  if (row.state === "done") {
    const answer = row.answer as Record<string, unknown> | null | undefined;
    return Boolean(answer) && typeof answer?.ko === "string" && typeof answer?.vi === "string";
  }
  return false;
}
