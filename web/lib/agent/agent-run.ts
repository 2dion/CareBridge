import "server-only";

import { readRecordNativeLang } from "@/lib/records/record-lang";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getClaudeClient } from "@/lib/ai/claude";
import { getAiMode, getAiModels } from "@/lib/config";
import { careTypeOf } from "@/lib/records/form-type";

import { getBlockedNames } from "./blocked-names";
import { readRecordItems, saveValidatedDraft } from "./draft-repository";
import { cachedSystem, totalTokens, withConversationCache } from "./prompt-cache";
import { AGENT_TOOLS, runAgent, type AgentDeps, type ContentBlock } from "./run-agent";
import { minutesBetween, type ValidateContext } from "./validate-draft";

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
      | "ai_not_configured"
      | "rate_limited",
  ) {
    super(code);
    this.name = "AgentRunError";
  }
}

// 응답 전체 제한. Vercel이 maxDuration(300초)에 함수를 끊으면 실패를 기록하지 못해 W3가 '정리 중'에 남는다(이슈 #235).
// 받아쓰기 시간을 뺀 여유를 두고, 넘으면 실패로 끝내 [다시 시도]를 보이게 한다.
const AGENT_TIME_LIMIT_MS = 240_000;

/** DB 함수 search_glossary(expression, max_results, lang)의 결과 한 줄 */
type GlossaryRow = {
  id: string;
  matched_expression: string;
  term_ko: string;
  /** lang의 고정 번역. 그 언어 번역이 없으면 빈값 */
  term_native: string;
  plain_ko: string;
  chapter: string;
  page: string;
};

type RecordForContext = {
  form_type: string | number; // DB는 smallint(16 / 12)
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
  // 번역 언어는 기록을 만든 때 언어(records.native_lang). 작성자가 나중에 바꾼 프로필 언어가 아니다(이슈 #336)
  const recordLang = await readRecordNativeLang(userClient, record.id);
  const context: ValidateContext = {
    transcript,
    careType: careTypeOf(record.form_type),
    nativeLang: recordLang ?? "ko",
    blockedNames: await getBlockedNames(serverClient, record.id, workerId),
  };
  if (record.visit_start && record.visit_end) {
    context.visitMinutes = minutesBetween(record.visit_start, record.visit_end);
  }
  return context;
}

export async function runAgentForRecord(
  userClient: SupabaseClient,
  serverClient: SupabaseClient,
  recordId: string,
  text?: string,
  options: {
    /** 호출 제한(agent) 한 번 쓰기. 한도 안이면 true. 기록·원문 검사를 지난 뒤 Claude 직전에 부른다(이슈 #279) */
    takeQuota?: () => Promise<boolean>;
  } = {},
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
  // 잘못된 요청(없는 기록·남의 기록·원문 없음)은 세지 않는다. 한도를 넘으면 Claude를 부르지 않는다(이슈 #279)
  if (options.takeQuota && !(await options.takeQuota())) throw new AgentRunError("rate_limited");

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
  const deadline = AbortSignal.timeout(AGENT_TIME_LIMIT_MS);
  const deps: AgentDeps = {
    async callClaude(system, messages) {
      // 시스템 프롬프트·도구 정의와 지금까지의 대화에 캐시 표시(프롬프트 캐싱). 적중은 코디세이 콘솔 '캐시' 칸으로 확인
      const response = await claude.messages.create(
        {
          model: getAiModels().main,
          max_tokens: 8000,
          system: cachedSystem(system),
          tools: AGENT_TOOLS as unknown as Anthropic.Tool[],
          messages: withConversationCache(messages) as unknown as Anthropic.MessageParam[],
        },
        { timeout: 90_000, maxRetries: 1, signal: deadline }, // 시간 초과·연결 오류는 한 번 다시
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
      return { content, tokens: totalTokens(response.usage) };
    },
    async searchGlossary(expression) {
      const { data, error } = await userClient.rpc("search_glossary", {
        expression,
        max_results: 5,
        lang: nativeLang,
      });
      if (error) throw new Error(`용어 검색 실패: ${error.message}`);
      // Agent에는 작성자 모국어 번역(term_native)을 건넨다(이슈 #259). 옛 베트남어 칸은 지웠다(이슈 #280)
      return ((data ?? []) as GlossaryRow[]).map(
        ({ id, matched_expression, term_ko, term_native, plain_ko, chapter, page }) => ({
          id,
          matched_expression,
          term_ko,
          term_native,
          plain_ko,
          chapter,
          page,
        }),
      );
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
  // 초안을 만들었으니 앞서 실패했거나 멈춘 녹음 작업을 끝낸다. 남겨 두면 W3가 실패·정리 중으로 보인다(이슈 #234)
  const { error: jobError } = await serverClient
    .from("audio_jobs")
    .update({ status: "done", error: "" })
    .eq("record_id", recordId)
    .eq("target", "record")
    .neq("status", "done");
  if (jobError) console.error("audio job cleanup failed", recordId, jobError.message);
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
