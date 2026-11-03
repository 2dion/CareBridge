import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as agentRun } from "@/app/api/records/[id]/agent-run/route";
import { POST as audio } from "@/app/api/records/[id]/audio/route";
import { POST as itemText } from "@/app/api/records/[id]/items/[key]/route";
import { POST as helperAsk } from "@/app/api/helper/ask/route";
import { runAgentForRecord } from "@/lib/agent/agent-run";
import { addItemByText, receiveAudio } from "@/lib/audio/audio-service";
import { askHelper } from "@/lib/helper/ask";

import { enforceQuota } from "./rate-limit-supabase";

// 이슈 #256: 한도를 넘으면 각 API가 AI를 부르지 않고 429를 그대로 돌려준다
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./rate-limit-supabase", () => ({ enforceQuota: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/agent/agent-run", () => ({
  AgentRunError: class extends Error {},
  runAgentForRecord: vi.fn(),
}));
vi.mock("@/lib/audio/audio-service", () => ({ addItemByText: vi.fn(), receiveAudio: vi.fn() }));
vi.mock("@/lib/helper/ask", () => ({ askHelper: vi.fn() }));
vi.mock("@/lib/helper/ask-supabase", () => ({ createHelperDeps: vi.fn() }));
vi.mock("@/lib/records/item-patch", () => ({ patchItem: vi.fn() }));
vi.mock("@/lib/records/item-patch-supabase", () => ({ createItemPatchDeps: vi.fn() }));

const limited = () => Response.json({ error: "rate_limited" }, { status: 429 });
const request = (body: unknown = {}) =>
  new Request("http://test/api", { method: "POST", body: JSON.stringify(body) });
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

beforeEach(() => {
  vi.mocked(enforceQuota).mockReset();
  vi.mocked(enforceQuota).mockImplementation(async () => limited());
});

describe("한도 초과 429", () => {
  it.each([
    [
      "agent-run",
      "agent",
      () => agentRun(request({ text: "글" }), ctx({ id: "r1" })),
      runAgentForRecord,
    ],
    [
      "audio",
      "audio",
      () => audio(request({ storage_path: "x" }), ctx({ id: "r1" })),
      receiveAudio,
    ],
    [
      "items/:key POST",
      "item",
      () => itemText(request({ text: "글" }), ctx({ id: "r1", key: "meal" })),
      addItemByText,
    ],
    ["helper/ask", "helper", () => helperAsk(request({ question: "질문" })), askHelper],
  ] as const)(
    "%s: 종류 %s로 세고 429를 돌려준 뒤 AI를 부르지 않는다",
    async (_, kind, call, work) => {
      const response = await call();
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "rate_limited" });
      expect(enforceQuota).toHaveBeenCalledWith(kind);
      expect(work).not.toHaveBeenCalled();
    },
  );

  it("items/:key POST는 잘못된 항목이면 세기 전에 400", async () => {
    const response = await itemText(request({ text: "글" }), ctx({ id: "r1", key: "nope" }));
    expect(response.status).toBe(400);
    expect(enforceQuota).not.toHaveBeenCalled();
  });
});
