// 지난 도우미 대화 불러오기(W6를 열 때, 이전 대화를 고를 때). 작성자 본인의 대화 하나를 최근부터 나눠 준다(이슈 #218, #251).
// 근거: 문서/설계/데이터구조-v2.3.4.md '공통 계약' GET /api/helper/messages, 문서/결정/2026-11-03-도우미대화묶음.md
// DB 읽기는 HelperMessagesDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.
import type { Role } from "@/lib/auth/signup";
import type { ApiResult } from "@/lib/records/transition";

export const DEFAULT_MESSAGES_LIMIT = 50;
export const MAX_MESSAGES_LIMIT = 100;

/** helper_messages에서 읽은 1행 중 화면에 필요한 칸 */
export type StoredHelperRow = {
  id: string;
  question: string;
  answer_ko: string;
  answer_native: string;
  source: string;
  found: boolean;
  created_at: string;
};

export type ConversationRef = { id: string; title: string };

export type HelperMessagesDeps = {
  currentUser(): Promise<{ id: string; role: Role } | null>;
  /** 내 대화 하나(RLS + worker_id). 남의 것이거나 없으면 null */
  findConversation(conversationId: string, workerId: string): Promise<ConversationRef | null>;
  /** 마지막 질문 시각이 가장 최근인 내 대화. 대화가 하나도 없으면 null */
  latestConversation(workerId: string): Promise<ConversationRef | null>;
  /** 그 대화의 행을 created_at 내림차순으로. before가 있으면 그보다 앞의 것만 */
  fetchMessages(
    conversationId: string,
    before: string | null,
    count: number,
  ): Promise<StoredHelperRow[]>;
};

export function parseLimit(raw: string | null, fallback: number, max: number): number | null {
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const limit = Number(raw);
  return limit >= 1 && limit <= max ? limit : null;
}

/** before 값은 앞서 받은 시각 그대로(마이크로초까지)라 문자열로 넘기고, 시각 모양만 본다 */
export const isTimestamp = (value: string) => !Number.isNaN(Date.parse(value));

// GET /api/helper/messages — 작성자. 입력 conversation_id(없으면 가장 최근 대화)·before·limit.
// 출력 conversation({ id, title } 또는 대화가 없으면 null)·messages(오래된 것부터)·next_before
export async function listHelperMessages(
  params: URLSearchParams,
  deps: HelperMessagesDeps,
): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return { status: 401, body: { error: "not_signed_in" } };
  if (user.role !== "worker") return { status: 403, body: { error: "not_record_worker" } };

  const limit = parseLimit(params.get("limit"), DEFAULT_MESSAGES_LIMIT, MAX_MESSAGES_LIMIT);
  const before = params.get("before") || null;
  const conversationId = params.get("conversation_id") || null;
  if (limit === null || (before !== null && !isTimestamp(before))) {
    return { status: 400, body: { error: "invalid_input" } };
  }

  const conversation = conversationId
    ? await deps.findConversation(conversationId, user.id)
    : await deps.latestConversation(user.id);
  if (conversationId && !conversation) {
    return { status: 404, body: { error: "conversation_not_found" } };
  }
  if (!conversation) {
    return { status: 200, body: { conversation: null, messages: [], next_before: null } };
  }

  // 하나 더 읽어 더 이전 질문이 있는지 안다
  const rows = await deps.fetchMessages(conversation.id, before, limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return {
    status: 200,
    body: {
      conversation: { id: conversation.id, title: conversation.title },
      messages: page.map((row) => ({
        id: row.id,
        question: row.question,
        answer: {
          ko: row.answer_ko,
          vi: row.answer_native,
          source: row.source || null,
          found: row.found,
        },
        created_at: row.created_at,
      })),
      next_before: hasMore ? page[0].created_at : null,
    },
  };
}
