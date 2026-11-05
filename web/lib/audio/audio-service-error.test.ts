import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { transcribeAudio } from "@/lib/stt/transcribe";

import { buildStoragePath } from "./audio";
import { receiveAudio } from "./audio-service";

// 이슈 #256: 녹음 API가 DB 오류 원문을 돌려주지 않는다
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({
  getAiMode: () => "real",
  getAiModels: () => ({ main: "m", light: "m" }),
}));
vi.mock("@/lib/stt/transcribe", () => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/agent/agent-run", () => ({
  buildValidateContext: vi.fn(),
  runAgentForRecord: vi.fn(),
}));
vi.mock("@/lib/ai/claude", () => ({ getClaudeClient: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const RECORD = "22222222-2222-4222-8222-222222222222";

function clients(saveMessage: string) {
  const jobUpdates: Record<string, unknown>[] = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const name of ["select", "eq", "insert", "update"]) c[name] = () => c;
    c.single = async () => result;
    c.maybeSingle = async () => result;
    c.then = (done: (v: unknown) => unknown) => Promise.resolve(result).then(done);
    return c;
  };
  const user = {
    auth: { getUser: async () => ({ data: { user: { id: "w1" } } }) },
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob(["a"]), error: null }),
        remove: async () => ({ error: null }),
      }),
    },
    from: (table: string) => {
      if (table === "records") {
        return {
          ...chain({
            data: {
              id: RECORD,
              org_id: ORG,
              worker_id: "w1",
              status: "draft",
              form_type: 16,
              transcript: "",
              visit_start: null,
              visit_end: null,
            },
          }),
          update: () => chain({ error: { message: saveMessage } }),
        };
      }
      return chain({ data: { id: "job-1" }, error: null });
    },
  } as unknown as SupabaseClient;
  const server = {
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        jobUpdates.push(fields);
        return chain({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { user, server, jobUpdates };
}

const body = () => ({
  target: "record",
  storage_path: buildStoragePath(ORG, RECORD, "33333333-3333-4333-8333-333333333333", "audio/webm"),
});

beforeEach(() => {
  vi.mocked(transcribeAudio).mockReset();
  vi.mocked(transcribeAudio).mockResolvedValue("받아쓴 글");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("receiveAudio 409", () => {
  it("DB 오류 원문 대신 invalid_transition 키를 돌려준다", async () => {
    const raw = 'new row violates row-level security policy for table "records"';
    const { user, server, jobUpdates } = clients(raw);
    const result = await receiveAudio(user, server, RECORD, body(), vi.fn());
    expect(result.status).toBe(409);
    expect(result.body).toEqual({ id: "job-1", status: "failed", error: "invalid_transition" });
    expect(JSON.stringify(result.body)).not.toContain("row-level");
    // audio_jobs.error에도 원문 대신 오류 키만 남는다(같은 기관 사용자가 읽을 수 있음, 이슈 #279). 원문은 서버 로그로
    expect(jobUpdates).toContainEqual({ status: "failed", error: "invalid_transition" });
    expect(JSON.stringify(jobUpdates)).not.toContain("row-level");
    expect(console.error).toHaveBeenCalledWith("audio transcript save failed", "job-1", raw);
  });

  it("트리거 키 record_locked는 그대로 돌려준다", async () => {
    const { user, server } = clients("record_locked");
    const result = await receiveAudio(user, server, RECORD, body(), vi.fn());
    expect(result).toMatchObject({ status: 409, body: { error: "record_locked" } });
  });
});

// 이슈 #279: 받아쓰기 실패도 audio_jobs.error에 오류 키만 남긴다
describe("receiveAudio 받아쓰기 실패", () => {
  it("stt_failed 키만 남기고 원문은 로그로", async () => {
    vi.mocked(transcribeAudio).mockRejectedValue(new Error("upstream said: secret detail"));
    const { user, server, jobUpdates } = clients("");
    const result = await receiveAudio(user, server, RECORD, body(), vi.fn());
    expect(result).toMatchObject({ status: 502, body: { error: "stt_failed" } });
    expect(jobUpdates).toContainEqual({ status: "failed", error: "stt_failed" });
    expect(JSON.stringify(jobUpdates)).not.toContain("secret detail");
  });
});
