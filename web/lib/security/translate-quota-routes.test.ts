import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH as patchRoute } from "@/app/api/records/[id]/items/[key]/route";
import { POST as returnTranslate } from "@/app/api/records/[id]/return/translate/route";
import { patchItem } from "@/lib/records/item-patch";
import { translateReturnReason } from "@/lib/records/return-translation";

import { enforceQuota } from "./rate-limit-supabase";

// 이슈 #256: 번역(Claude)을 부르는 두 API도 translate 종류로 센다
vi.mock("server-only", () => ({}));
vi.mock("./rate-limit-supabase", () => ({ enforceQuota: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/audio/audio-service", () => ({ addItemByText: vi.fn() }));
vi.mock("@/lib/records/item-patch", () => ({ patchItem: vi.fn() }));
vi.mock("@/lib/records/item-patch-supabase", () => ({ createItemPatchDeps: vi.fn() }));
vi.mock("@/lib/records/return-translation", () => ({ translateReturnReason: vi.fn() }));
vi.mock("@/lib/records/return-translation-supabase", () => ({
  createReturnTranslationDeps: vi.fn(),
}));

const limited = () => Response.json({ error: "rate_limited" }, { status: 429 });
const request = (method: string, body?: unknown) =>
  new Request("http://test/api", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const itemCtx = () => ctx({ id: "r1", key: "meal" });

beforeEach(() => {
  vi.mocked(enforceQuota).mockReset();
  vi.mocked(patchItem).mockReset();
  vi.mocked(translateReturnReason).mockReset();
  vi.mocked(patchItem).mockResolvedValue({ status: 200, body: { ok: true } } as never);
  vi.mocked(translateReturnReason).mockResolvedValue({ status: 200, body: {} } as never);
});

describe("PATCH /items/:key", () => {
  it("value_ko를 바꾸면 translate로 세고, 넘으면 429를 그대로 돌려준다", async () => {
    vi.mocked(enforceQuota).mockImplementation(async () => limited());
    const response = await patchRoute(request("PATCH", { value_ko: "새 글" }), itemCtx());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(enforceQuota).toHaveBeenCalledWith("translate");
    expect(patchItem).not.toHaveBeenCalled();
  });

  it("한도 안이면 같은 본문으로 patchItem을 부른다", async () => {
    vi.mocked(enforceQuota).mockResolvedValue(null);
    const body = { value_ko: "새 글", confirmed_by_worker: true };
    const response = await patchRoute(request("PATCH", body), itemCtx());
    expect(response.status).toBe(200);
    expect(patchItem).toHaveBeenCalledWith("r1", "meal", body, undefined);
  });

  it.each([
    ["[확인 완료]", { confirmed_by_worker: true }],
    ["관리자 [확인함]·[기록 안 함]", { resolution: "omitted", resolution_note: "사유" }],
    ["시간·분만", { detail: { minutes: { meal: 10 } } }],
  ])("%s처럼 value_ko가 없는 PATCH는 세지 않는다", async (_, body) => {
    vi.mocked(enforceQuota).mockImplementation(async () => limited());
    const response = await patchRoute(request("PATCH", body), itemCtx());
    expect(response.status).toBe(200);
    expect(enforceQuota).not.toHaveBeenCalled();
    expect(patchItem).toHaveBeenCalled();
  });

  it("본문이 JSON이 아니어도 세지 않고 patchItem이 판단한다", async () => {
    const response = await patchRoute(
      new Request("http://test/api", { method: "PATCH", body: "x" }),
      itemCtx(),
    );
    expect(response.status).toBe(200);
    expect(enforceQuota).not.toHaveBeenCalled();
  });
});

describe("POST /return/translate", () => {
  it("translate로 세고, 넘으면 429를 그대로 돌려준 뒤 번역하지 않는다", async () => {
    vi.mocked(enforceQuota).mockImplementation(async () => limited());
    const response = await returnTranslate(request("POST"), ctx({ id: "r1" }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(enforceQuota).toHaveBeenCalledWith("translate");
    expect(translateReturnReason).not.toHaveBeenCalled();
  });

  it("한도 안이면 번역한다", async () => {
    vi.mocked(enforceQuota).mockResolvedValue(null);
    const response = await returnTranslate(request("POST"), ctx({ id: "r1" }));
    expect(response.status).toBe(200);
    expect(translateReturnReason).toHaveBeenCalledOnce();
  });
});
