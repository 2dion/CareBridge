import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getClaudeClient } from "@/lib/ai/claude";

import { AgentRunError, runAgentForRecord } from "./agent-run";
import { type AgentDeps, runAgent } from "./run-agent";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({
  getAiMode: () => "real",
  getAiModels: () => ({ main: "test-model", light: "test-model" }),
}));
vi.mock("@/lib/ai/claude", () => ({ getClaudeClient: vi.fn() }));
vi.mock("./blocked-names", () => ({ getBlockedNames: vi.fn(async () => []) }));
vi.mock("./draft-repository", () => ({
  readRecordItems: vi.fn(async () => []),
  saveValidatedDraft: vi.fn(),
}));
vi.mock("./run-agent", async (original) => ({
  ...(await original<typeof import("./run-agent")>()),
  runAgent: vi.fn(),
}));

type Row = Record<string, unknown>;
type Op = { table: string; op: string; args: unknown[] };

/** Supabase 체인 흉내. then으로 끝나면 { data, error, count }를 준다 */
function client(tables: Record<string, Row | null>, log: Op[]) {
  const from = (table: string) => {
    const result = { data: tables[table] ?? null, error: null, count: 0 };
    const note = (op: string, args: unknown[]) => {
      log.push({ table, op, args });
      return chain;
    };
    const chain = {
      select: () => chain,
      eq: (...args: unknown[]) => note("eq", args),
      neq: (...args: unknown[]) => note("neq", args),
      update: (...args: unknown[]) => note("update", args),
      insert: (...args: unknown[]) => note("insert", args),
      single: async () => result,
      maybeSingle: async () => result,
      then: (done: (value: typeof result) => unknown) => Promise.resolve(result).then(done),
    };
    return chain;
  };
  return {
    from,
    rpc: async () => ({ data: [], error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "w1" } } }) },
  } as unknown as SupabaseClient;
}

const baseRecord = {
  id: "rec-1",
  org_id: "org",
  worker_id: "w1",
  status: "draft",
  form_type: 16,
  transcript: "원문",
  visit_start: null,
  visit_end: null,
};

function setup(record: Row = baseRecord) {
  const log: Op[] = [];
  const tables = { records: record, profiles: { native_lang: "vi" } };
  return { log, user: client(tables, []), server: client({}, log) };
}
const jobOps = (log: Op[]) => log.filter((entry) => entry.table === "audio_jobs");
const done = { endReason: "draft_returned" as const, downgraded: [] };
const body = { model: "m", max_tokens: 1, messages: [{ role: "user" as const, content: "x" }] };

beforeEach(() => {
  vi.mocked(runAgent).mockReset();
  vi.mocked(getClaudeClient).mockReset();
  vi.mocked(getClaudeClient).mockReturnValue({} as Anthropic);
});
afterEach(() => vi.restoreAllMocks());

describe("runAgentForRecord audio_jobs 정리 (이슈 #234)", () => {
  it("성공하면 그 기록의 끝나지 않은 전체 녹음 작업을 done으로 끝낸다", async () => {
    vi.mocked(runAgent).mockResolvedValue(done);
    const { log, user, server } = setup();
    const result = await runAgentForRecord(user, server, "rec-1");
    expect(result.end_reason).toBe("draft_returned");
    const ops = jobOps(log);
    expect(ops.find((op) => op.op === "update")?.args).toEqual([{ status: "done", error: "" }]);
    expect(ops.filter((op) => op.op !== "update").map((op) => [op.op, ...op.args])).toEqual([
      ["eq", "record_id", "rec-1"],
      ["eq", "target", "record"],
      ["neq", "status", "done"],
    ]);
  });

  it("auto_stopped(초안 저장됨)도 정리한다", async () => {
    vi.mocked(runAgent).mockResolvedValue({ endReason: "auto_stopped", downgraded: [] });
    const { log, user, server } = setup();
    await runAgentForRecord(user, server, "rec-1");
    expect(jobOps(log).some((op) => op.op === "update")).toBe(true);
  });

  it("Agent가 실패하면 정리하지 않고 오류를 그대로 던진다", async () => {
    vi.mocked(runAgent).mockRejectedValue(new Error("claude failed"));
    const { log, user, server } = setup();
    await expect(runAgentForRecord(user, server, "rec-1")).rejects.toThrow("claude failed");
    expect(jobOps(log)).toEqual([]);
  });

  it("원문이 없으면 no_transcript로 끝나고 정리하지 않는다", async () => {
    const { log, user, server } = setup({ ...baseRecord, transcript: "" });
    const error = await runAgentForRecord(user, server, "rec-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentRunError);
    expect((error as AgentRunError).code).toBe("no_transcript");
    expect(runAgent).not.toHaveBeenCalled();
    expect(jobOps(log)).toEqual([]);
  });
});

describe("Agent 시간 제한 (이슈 #235)", () => {
  it("4분 제한 신호 하나를 Claude 호출마다 넘긴다", async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const create = vi.fn(async () => ({ content: [], usage: {} }));
    vi.mocked(getClaudeClient).mockReturnValue({ messages: { create } } as unknown as Anthropic);
    vi.mocked(runAgent).mockImplementation(async (_input, deps: AgentDeps) => {
      await deps.callClaude("system", []);
      await deps.callClaude("system", []);
      return done;
    });
    const { user, server } = setup();
    await runAgentForRecord(user, server, "rec-1");
    expect(timeout).toHaveBeenCalledExactlyOnceWith(240_000);
    expect(create).toHaveBeenCalledTimes(2);
    for (const call of create.mock.calls as unknown as [unknown, Row][]) {
      expect(call[1]).toEqual({ timeout: 90_000, maxRetries: 1, signal });
    }
  });

  it("실제 SDK: 제한이 지나면 진행 중 요청을 끊고 다시 시도하지 않는다", async () => {
    let calls = 0;
    let seen: AbortSignal | null | undefined;
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls++;
      seen = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        seen?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const sdk = new Anthropic({ apiKey: null, authToken: "t", baseURL: "http://test", fetch });
    const signal = AbortSignal.timeout(30);
    await expect(
      sdk.messages.create(body, { timeout: 90_000, maxRetries: 1, signal }),
    ).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    expect(calls).toBe(1);
    expect(seen?.aborted).toBe(true);
  });

  it("실제 SDK: 이미 지난 제한이면 요청을 보내지 않는다", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    const sdk = new Anthropic({ apiKey: null, authToken: "t", baseURL: "http://test", fetch });
    await expect(
      sdk.messages.create(body, { maxRetries: 1, signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("제한으로 끊기면 runAgent가 오류를 넘겨 audio_jobs를 정리하지 않는다", async () => {
    const { runAgent: realRunAgent } =
      await vi.importActual<typeof import("./run-agent")>("./run-agent");
    vi.mocked(runAgent).mockImplementation(realRunAgent);
    const create = vi.fn(async () => {
      throw new Anthropic.APIUserAbortError();
    });
    vi.mocked(getClaudeClient).mockReturnValue({ messages: { create } } as unknown as Anthropic);
    const { log, user, server } = setup();
    await expect(runAgentForRecord(user, server, "rec-1")).rejects.toBeInstanceOf(
      Anthropic.APIUserAbortError,
    );
    expect(jobOps(log)).toEqual([]);
  });
});
