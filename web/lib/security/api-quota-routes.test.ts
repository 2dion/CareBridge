import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as agentRun } from "@/app/api/records/[id]/agent-run/route";
import { POST as audio } from "@/app/api/records/[id]/audio/route";
import { POST as itemText } from "@/app/api/records/[id]/items/[key]/route";
import { POST as helperAsk } from "@/app/api/helper/ask/route";
import { AgentRunError, runAgentForRecord } from "@/lib/agent/agent-run";
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
vi.mock("@/lib/audio/audio-service", () => ({
  addItemByText: vi.fn(),
  receiveAudio: vi.fn(),
  parseItemText: (body: unknown) => {
    const text = (body as { text?: unknown })?.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  },
}));
vi.mock("@/lib/helper/ask", async () => ({
  ...(await vi.importActual<typeof import("@/lib/helper/ask")>("@/lib/helper/ask")),
  askHelper: vi.fn(),
}));
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
  vi.mocked(runAgentForRecord).mockReset();
  vi.mocked(receiveAudio).mockReset();
  vi.mocked(addItemByText).mockReset();
  vi.mocked(askHelper).mockReset();
});

describe("한도 초과 429", () => {
  it.each([
    [
      "audio",
      "audio",
      () => audio(request({ target: "record", storage_path: "x" }), ctx({ id: "r1" })),
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

  it("agent-run: 기록·원문 검사를 지난 뒤 Claude 직전에 agent로 세고, 넘으면 429 (이슈 #279)", async () => {
    vi.mocked(runAgentForRecord).mockImplementation(async (_user, _server, _id, _text, options) => {
      if (options?.takeQuota && !(await options.takeQuota())) {
        throw Object.assign(new AgentRunError("rate_limited"), { code: "rate_limited" });
      }
      return { end_reason: "draft_returned" } as never;
    });
    const response = await agentRun(request({ text: "글" }), ctx({ id: "r1" }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(enforceQuota).toHaveBeenCalledWith("agent");
  });
});

// 이슈 #279: 잘못된 요청은 AI를 부르지 않으므로 호출 제한도 세지 않는다
describe("형식이 틀린 요청은 세지 않음", () => {
  it("helper/ask: 빈 질문·너무 긴 질문", async () => {
    vi.mocked(askHelper).mockResolvedValue({ status: 400, body: { error: "invalid_input" } });
    for (const body of [{}, { question: "  " }, { question: "가".repeat(501) }]) {
      const response = await helperAsk(request(body));
      expect(response.status).toBe(400);
    }
    expect(enforceQuota).not.toHaveBeenCalled();
    expect(askHelper).toHaveBeenCalledTimes(3);
  });

  it("audio: target·storage_path가 없는 본문", async () => {
    vi.mocked(receiveAudio).mockResolvedValue({ status: 400, body: { error: "invalid_input" } });
    const response = await audio(request({ storage_path: "x" }), ctx({ id: "r1" }));
    expect(response.status).toBe(400);
    expect(enforceQuota).not.toHaveBeenCalled();
  });

  it("items/:key POST: 빈 글", async () => {
    vi.mocked(addItemByText).mockResolvedValue({ status: 400, body: { error: "invalid_input" } });
    const response = await itemText(request({ text: " " }), ctx({ id: "r1", key: "meal" }));
    expect(response.status).toBe(400);
    expect(enforceQuota).not.toHaveBeenCalled();
  });
});
