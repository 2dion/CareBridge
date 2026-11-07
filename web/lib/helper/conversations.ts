// 도우미 대화 목록(W6 · 이전 대화). 작성자 본인의 대화를 마지막 질문 시각 최근 순으로 나눠 준다(이슈 #251).
// 근거: 문서/설계/데이터구조-v2.3.9.md '공통 계약' GET /api/helper/conversations, 문서/결정/2026-11-03-도우미대화묶음.md
// DB 읽기는 HelperConversationsDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.
import type { Role } from "@/lib/auth/signup";
import type { ApiResult } from "@/lib/records/transition";

import { isTimestamp, parseLimit } from "./messages";

export const DEFAULT_CONVERSATIONS_LIMIT = 20;
export const MAX_CONVERSATIONS_LIMIT = 50;

/** helper_conversations에서 읽은 1행 중 화면에 필요한 칸 */
export type StoredConversationRow = {
  id: string;
  title: string;
  last_message_at: string;
  message_count: number;
};

export type HelperConversationsDeps = {
  currentUser(): Promise<{ id: string; role: Role } | null>;
  /** 내 대화를 last_message_at 내림차순으로. before가 있으면 그보다 앞의 것만 */
  fetchConversations(
    workerId: string,
    before: string | null,
    count: number,
  ): Promise<StoredConversationRow[]>;
};

/** 대화 제목: 첫 질문의 줄바꿈·연속 빈칸을 빈칸 하나로, 앞 30자, 넘으면 끝에 '…'(DB private.helper_title과 같은 규칙) */
export function conversationTitle(question: string): string {
  const flat = question.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length > 30 ? `${chars.slice(0, 30).join("")}…` : flat;
}

// GET /api/helper/conversations — 작성자. 입력 before(이 last_message_at보다 앞)·limit(기본 20, 최대 50).
// 출력 conversations(최근 것부터)·next_before(더 이전이 없으면 null)
export async function listHelperConversations(
  params: URLSearchParams,
  deps: HelperConversationsDeps,
): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return { status: 401, body: { error: "not_signed_in" } };
  if (user.role !== "worker") return { status: 403, body: { error: "not_record_worker" } };

  const limit = parseLimit(
    params.get("limit"),
    DEFAULT_CONVERSATIONS_LIMIT,
    MAX_CONVERSATIONS_LIMIT,
  );
  const before = params.get("before") || null;
  if (limit === null || (before !== null && !isTimestamp(before))) {
    return { status: 400, body: { error: "invalid_input" } };
  }

  // 하나 더 읽어 더 이전 대화가 있는지 안다
  const rows = await deps.fetchConversations(user.id, before, limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    status: 200,
    body: {
      conversations: page.map((row) => ({
        id: row.id,
        title: row.title,
        last_message_at: row.last_message_at,
        message_count: row.message_count,
      })),
      next_before: hasMore ? page[page.length - 1].last_message_at : null,
    },
  };
}
