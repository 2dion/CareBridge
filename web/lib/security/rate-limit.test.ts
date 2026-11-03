import { describe, expect, it, vi } from "vitest";

import { API_LIMITS, checkQuota, type QuotaDeps } from "./rate-limit";

// 이슈 #256: AI를 부르는 API의 사용자별 호출 제한
function deps(overrides: Partial<QuotaDeps> = {}): QuotaDeps {
  return {
    currentUserId: vi.fn(async () => "user-1"),
    take: vi.fn(async () => true),
    ...overrides,
  };
}

describe("checkQuota", () => {
  it("한도 안이면 null이고, 종류별 한도와 시간 창으로 센다", async () => {
    const d = deps();
    expect(await checkQuota("agent", d)).toBeNull();
    expect(d.take).toHaveBeenCalledWith("user-1", "agent", 20, 3600);
    await checkQuota("helper", d);
    expect(d.take).toHaveBeenLastCalledWith("user-1", "helper", 60, 3600);
  });

  it("한도를 넘으면 429 rate_limited", async () => {
    const response = await checkQuota("audio", deps({ take: vi.fn(async () => false) }));
    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: "rate_limited" });
  });

  it("take가 예외를 던지면 막지 않고 null", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      take: vi.fn(async () => {
        throw new Error("function take_api_quota does not exist");
      }),
    });
    expect(await checkQuota("item", d)).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("로그인하지 않았으면 세지 않고 null(로그인 검사는 각 API)", async () => {
    const d = deps({ currentUserId: vi.fn(async () => null) });
    expect(await checkQuota("agent", d)).toBeNull();
    expect(d.take).not.toHaveBeenCalled();
  });

  it("한도 값은 결정 기록과 같다", () => {
    expect(API_LIMITS).toEqual({
      agent: { limit: 20, windowSeconds: 3600 },
      audio: { limit: 30, windowSeconds: 3600 },
      item: { limit: 30, windowSeconds: 3600 },
      helper: { limit: 60, windowSeconds: 3600 },
      translate: { limit: 120, windowSeconds: 3600 },
    });
  });
});
