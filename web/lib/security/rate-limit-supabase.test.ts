import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAiMode } from "@/lib/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { enforceQuota } from "./rate-limit-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ getAiMode: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const rpc = vi.fn();

beforeEach(() => {
  vi.mocked(getAiMode).mockReset();
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(createSupabaseAdminClient).mockReset();
  rpc.mockReset();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  } as never);
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as never);
});

describe("enforceQuota", () => {
  it("Mock 모드면 DB를 부르지 않고 null", async () => {
    vi.mocked(getAiMode).mockReturnValue("mock");
    expect(await enforceQuota("agent")).toBeNull();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("실제 모드는 service_role로 take_api_quota를 부른다", async () => {
    vi.mocked(getAiMode).mockReturnValue("real" as never);
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await enforceQuota("item")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("take_api_quota", {
      p_user_id: "user-1",
      p_kind: "item",
      p_limit: 30,
      p_window_seconds: 3600,
    });
  });

  it("함수가 false면 429", async () => {
    vi.mocked(getAiMode).mockReturnValue("real" as never);
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await enforceQuota("helper"))?.status).toBe(429);
  });

  it("함수 오류(마이그레이션 전 등)는 통과", async () => {
    vi.mocked(getAiMode).mockReturnValue("real" as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    expect(await enforceQuota("audio")).toBeNull();
  });
});
