// AI를 부르는 API의 사용자별 호출 제한. 한 계정의 반복 호출이 기관 공용 월 토큰을 다 쓰지 않게 한다(이슈 #256).
// 근거: 문서/결정/2026-11-03-ai호출제한.md, 문서/설계/데이터구조-v2.3.11.md '응답 코드와 오류 키'
// DB 호출은 QuotaDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

/** 1시간에 몇 번까지. Agent는 응답이 여러 번이라 가장 적게 둔다 */
export const API_LIMITS = {
  agent: { limit: 20, windowSeconds: 3600 },
  audio: { limit: 30, windowSeconds: 3600 },
  item: { limit: 30, windowSeconds: 3600 },
  helper: { limit: 60, windowSeconds: 3600 },
  translate: { limit: 120, windowSeconds: 3600 },
} as const;

export type ApiKind = keyof typeof API_LIMITS;

/** 평가용 계정(README 공개 계정)은 하루 기준의 낮은 한도. 공개 계정 하나로 월 토큰이 소진되지 않게 한다(11/08 팀장 전달) */
export const LIMITED_API_LIMITS = {
  agent: { limit: 10, windowSeconds: 86400 },
  audio: { limit: 10, windowSeconds: 86400 },
  item: { limit: 20, windowSeconds: 86400 },
  helper: { limit: 40, windowSeconds: 86400 },
  translate: { limit: 80, windowSeconds: 86400 },
} as const satisfies Record<ApiKind, { limit: number; windowSeconds: number }>;

/** 환경 변수 AI_LIMITED_USER_IDS(쉼표 구분 사용자 id)를 읽는다. 비었거나 없으면 빈 집합. id 자체는 저장소에 두지 않는다 */
export function limitedUserIds(
  env: string | undefined = process.env.AI_LIMITED_USER_IDS,
): Set<string> {
  return new Set(
    (env ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

/** 사용자가 평가용 목록에 있으면 하루 한도, 아니면 기본 한도 */
export function limitsFor(
  kind: ApiKind,
  userId: string,
  env?: string,
): { limit: number; windowSeconds: number } {
  return limitedUserIds(env).has(userId) ? LIMITED_API_LIMITS[kind] : API_LIMITS[kind];
}

export type QuotaDeps = {
  /** 로그인한 사람 id. 로그인하지 않았으면 null */
  currentUserId(): Promise<string | null>;
  /** 한도 안이면 한 번을 쓰고 true, 넘었으면 false */
  take(userId: string, kind: ApiKind, limit: number, windowSeconds: number): Promise<boolean>;
};

/** 한도를 넘었으면 429 응답, 아니면 null. 로그인 검사는 각 API가 한다 */
export async function checkQuota(kind: ApiKind, deps: QuotaDeps): Promise<Response | null> {
  const userId = await deps.currentUserId();
  if (!userId) return null;
  const { limit, windowSeconds } = limitsFor(kind, userId);
  try {
    if (await deps.take(userId, kind, limit, windowSeconds)) return null;
  } catch (error) {
    // 제한 검사가 실패해도(마이그레이션 전 등) 서비스는 막지 않고 로그만 남긴다
    console.error("rate limit check failed", kind, error);
    return null;
  }
  return Response.json({ error: "rate_limited" }, { status: 429 });
}
