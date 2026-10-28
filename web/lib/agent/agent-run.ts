import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getClaudeClient } from "@/lib/ai/claude";
import { getAiMode, getAiModels } from "@/lib/config";

import { getBlockedNames } from "./blocked-names";
import { readRecordItems, saveValidatedDraft } from "./draft-repository";
import { AGENT_TOOLS, runAgent, type AgentDeps, type ContentBlock } from "./run-agent";
import type { ValidateContext } from "./validate-draft";

// 기록 하나에 Agent를 돌린다. 받아쓰기가 끝나면 서버가(/audio), [다시 시도]·[글로 쓰기] 뒤에는 작성자가(/agent-run) 부른다.
// 읽기·원문 저장은 작성자 권한, 초안 저장(save_record_ai_draft)·작업 기록(agent_steps)은 서버(service_role).

export class AgentRunError extends Error {
  constructor(
    readonly code:
      | "not_signed_in"
      | "record_not_found"
      | "not_record_worker"
      | "invalid_transition"
      | "no_transcript"
      | "ai_not_configured",
  ) {
    super(code);
    this.name = "AgentRunError";
  }
}

const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

type RecordForContext = {
  form_type: string;
  visit_start: string | null;
  visit_end: string | null;
};

/** 서버 검사(validateDraft)에 필요한 값. 작성자 언어·이름 목록·방문 시간은 DB에서 읽는다 */
export async function buildValidateContext(
  userClient: SupabaseClient,
  serverClient: SupabaseClient,
  record: RecordForContext & { id: string },
  workerId: string,
  transcript: string,
): Promise<ValidateContext> {
  const { data: profile } = await userClient
    .from("profiles")
    .select("native_lang")
    .eq("id", workerId)
    .single();
  const context: ValidateContext = {
    transcript,
    careType: record.form_type === "12" ? "home" : "facility",
    nativeLang: profile?.native_lang === "ko" ? "ko" : "vi",
    blockedNames: await getBlockedNames(serverClient, record.id, workerId),
  };
  if (record.visit_start && record.visit_end) {
    context.visitMinutes = minutes(record.visit_end) - minutes(record.visit_start);
  }
  return context;
}

export async function runAgentForRecord(
  userClient: SupabaseClient,
  serverClient: SupabaseClient,
  recordId: string,
  text?: string,
) {
  // 키가 없으면 가짜 초안을 만들지 않고 거절한다
  if (getAiMode() === "mock") throw new AgentRunError("ai_not_configured");

  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) throw new AgentRunError("not_signed_in");
  const { data: record } = await userClient
    .from("records")
    .select("id, org_id, worker_id, status, form_type, transcript, visit_start, visit_end")
    .eq("id", recordId)
    .maybeSingle();
  if (!record) throw new AgentRunError("record_not_found");
  if (record.worker_id !== auth.user.id) throw new AgentRunError("not_record_worker");
  if (record.status !== "draft" && record.status !== "returned") {
    throw new AgentRunError("invalid_transition");
  }

  // [글로 쓰기]: 쓴 글을 원문으로 저장한다(원문은 작성자만 바꿈, 권한정리 결정 6)
  let transcript: string = record.transcript ?? "";
  if (text !== undefined) {
    transcript = text.trim();
    const { error } = await userClient
      .from("records")
      .update({ transcript })
      .eq("id", recordId)
      .select("id");
    if (error) throw new Error(`원문 저장 실패: ${error.message}`);
  }
  if (!transcript) throw new AgentRunError("no_transcript");

  const context = await buildValidateContext(
    userClient,
    serverClient,
    record,
    auth.user.id,
    transcript,
  );
  const careType = context.careType;
  const nativeLang = context.nativeLang ?? "vi";

  // [다시 시도]면 앞 작업 기록 뒤에 이어 쓴다
  const { count } = await serverClient
    .from("agent_steps")
    .select("id", { count: "exact", head: true })
    .eq("record_id", recordId);
  const stepOffset = count ?? 0;

  const claude = getClaudeClient();
  const deps: AgentDeps = {
    async callClaude(system, messages) {
      const response = await claude.messages.create(
        {
          model: getAiModels().main,
          max_tokens: 8000,
          system,
          tools: AGENT_TOOLS as unknown as Anthropic.Tool[],
          messages: messages as unknown as Anthropic.MessageParam[],
        },
        { timeout: 90_000, maxRetries: 1 }, // 시간 초과·연결 오류는 한 번 다시
      );
      const content = response.content.flatMap((block): ContentBlock[] => {
        if (block.type === "text") return [{ type: "text", text: block.text }];
        if (block.type === "tool_use") {
          return [
            {
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: (block.input ?? {}) as Record<string, unknown>,
            },
          ];
        }
        return [];
      });
      return { content, tokens: response.usage.input_tokens + response.usage.output_tokens };
    },
    async searchTerms(expression) {
      const { data, error } = await userClient.rpc("search_glossary", {
        expression,
        max_results: 5,
      });
      if (error) throw new Error(`용어 검색 실패: ${error.message}`);
      return data ?? [];
    },
    async saveDraft(draft) {
      const { validation } = await saveValidatedDraft(userClient, serverClient, recordId, draft);
      return { downgraded: validation.downgraded };
    },
    async logStep(step) {
      const { error } = await serverClient.from("agent_steps").insert({
        org_id: record.org_id,
        record_id: recordId,
        ...step,
        step_no: step.step_no + stepOffset,
      });
      if (error) throw new Error(`작업 기록 실패: ${error.message}`);
    },
    now: () => Date.now(),
  };

  const result = await runAgent({ transcript, careType, nativeLang, context }, deps);
  const { data: saved } = await userClient
    .from("records")
    .select("form_fields")
    .eq("id", recordId)
    .single();
  return {
    end_reason: result.endReason,
    downgraded: result.downgraded,
    items: await readRecordItems(userClient, recordId),
    form_fields: saved?.form_fields ?? {},
  };
}
