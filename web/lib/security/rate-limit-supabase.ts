import "server-only";

import { getAiMode } from "@/lib/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { type ApiKind, checkQuota } from "./rate-limit";

// 횟수는 서버 전용 함수 take_api_quota가 센다. Mock 모드는 AI를 부르지 않으므로 세지 않는다.
export async function enforceQuota(kind: ApiKind): Promise<Response | null> {
  if (getAiMode() === "mock") return null;
  const supabase = await createSupabaseServerClient();
  return checkQuota(kind, {
    async currentUserId() {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    async take(userId, quotaKind, limit, windowSeconds) {
      const { data, error } = await createSupabaseAdminClient().rpc("take_api_quota", {
        p_user_id: userId,
        p_kind: quotaKind,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
  });
}
