// 지난 도우미 대화 불러오기(W6를 열 때). 작성자 본인의 helper_messages만 최근부터 나눠 준다(이슈 #218).
// 근거: 문서/설계/데이터구조-v1.7.md '공통 계약' GET /api/helper/messages
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

export type HelperMessagesDeps = {
  currentUser(): Promise<{ id: string; role: Role } | null>;
  /** 내 행을 created_at 내림차순으로. before가 있으면 그보다 앞의 것만 */
  fetchMessages(workerId: string, before: string | null, count: number): Promise<StoredHelperRow[]>;
};

function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === "") return DEFAULT_MESSAGES_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const limit = Number(raw);
  return limit >= 1 && limit <= MAX_MESSAGES_LIMIT ? limit : null;
}

// GET /api/helper/messages — 작성자. 입력 before(이 시각보다 앞)·limit. 출력 messages(오래된 것부터)·next_before
export async function listHelperMessages(
  params: URLSearchParams,
  deps: HelperMessagesDeps,
): Promise<ApiResult> {
  const user = await deps.currentUser();
  if (!user) return { status: 401, body: { error: "not_signed_in" } };
  if (user.role !== "worker") return { status: 403, body: { error: "not_record_worker" } };

  const limit = parseLimit(params.get("limit"));
  const before = params.get("before") || null;
  // before는 앞서 받은 created_at 그대로(마이크로초까지)라 문자열로 넘기고, 시각 모양만 본다
  if (limit === null || (before !== null && Number.isNaN(Date.parse(before)))) {
    return { status: 400, body: { error: "invalid_input" } };
  }

  // 하나 더 읽어 더 이전 대화가 있는지 안다
  const rows = await deps.fetchMessages(user.id, before, limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return {
    status: 200,
    body: {
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
