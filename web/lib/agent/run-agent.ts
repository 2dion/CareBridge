// ② 기록 검토 준비 Agent: Claude가 도구 4개를 골라 부르고, 서버가 도구를 실행한다.
// 근거: 문서/설계/ai규칙-v1.1.1.md '② 기록 검토 준비 Agent'(흐름·도구 4개·멈춤 규칙·작업 기록·프롬프트 초안),
//       문서/설계/데이터구조-v1.6.3.md 'Agent 도구 입출력'
// Claude 호출·용어 검색·저장·작업 기록은 AgentDeps로 받아서, 이 파일은 키 없이 테스트(Vitest)할 수 있다.

import { getFormSpec } from "./form-spec";
import {
  allNeedsCheckDraft,
  ITEM_KEYS,
  REASONS_VI,
  validateDraft,
  type CareType,
  type Draft,
  type ValidateContext,
} from "./validate-draft";

export const MAX_RESPONSES = 4;
export const AUTO_STOP_REASON = "자동 정리 중단";

export type AgentTool = "get_form_spec" | "search_terms" | "validate_draft" | "submit_draft";

export type ToolUse = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ContentBlock = { type: "text"; text: string } | ToolUse;
export type AgentMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResult[];
};
export type ToolResult = { type: "tool_result"; tool_use_id: string; content: string };

export type AgentStep = {
  step_no: number;
  tool: AgentTool;
  input_summary: string;
  result_summary: string;
  reason: string;
  duration_ms: number;
  tokens: number | null;
};

export type AgentDeps = {
  /** Claude 응답 1번. tokens는 그 응답의 입력+출력 토큰 */
  callClaude(
    system: string,
    messages: AgentMessage[],
  ): Promise<{ content: ContentBlock[]; tokens: number }>;
  searchTerms(expression: string): Promise<unknown[]>;
  /** 검증한 초안 저장(saveValidatedDraft). 낮춘 항목을 돌려줌 */
  saveDraft(draft: unknown): Promise<{ downgraded: string[] }>;
  logStep(step: AgentStep): Promise<void>;
  now(): number;
};

export type AgentInput = {
  transcript: string;
  careType: CareType;
  nativeLang: "ko" | "vi";
  context: ValidateContext;
};

export type AgentResult = {
  /** 초안 반환 / 자동 정리 중단 (실패는 예외로 던짐) */
  endReason: "draft_returned" | "auto_stopped";
  downgraded: string[];
};

export class ToolFailedError extends Error {
  constructor(tool: string, cause: unknown) {
    super(`tool_failed: ${tool}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "ToolFailedError";
  }
}

// 초안(draft)의 정확한 모양. 10/28 실제 시험에서 모양을 "객체"라고만 적으니 Claude가 items를 배열이 아닌
// 객체로 보내 검증 3번이 모두 형식 오류로 끝났다. 데이터 구조 '세부 칸 이름은 BE가 정함'에 따라 여기서 정한다.
export const DRAFT_SCHEMA = {
  type: "object",
  description:
    "초안. items는 반드시 9개 항목을 이 순서의 배열로: visit_time, support, meal, sleep, discomfort, medication, cognition, notes, next_check",
  properties: {
    transcript_ko: { type: "string", description: "원문 전체의 한국어 번역" },
    items: {
      type: "array",
      minItems: 9,
      maxItems: 9,
      items: {
        type: "object",
        properties: {
          item_key: { type: "string", enum: [...ITEM_KEYS] },
          value_ko: { type: "string", description: "한국어 기록체. 없으면 빈 문자열" },
          value_native: { type: "string", description: "value_ko의 모국어 번역. 없으면 빈 문자열" },
          status: { type: "string", enum: ["observed", "not_mentioned", "needs_check"] },
          evidence: { type: "string", description: "원문 문장 그대로. 없으면 빈 문자열" },
          reason: { type: "string", description: "needs_check인 이유. 아니면 빈 문자열" },
          reason_native: { type: "string", description: "reason의 모국어 번역. 없으면 빈 문자열" },
          detail: {
            type: "object",
            description: "항목별 추가 값(예: intake, checks, minutes, trend). 없으면 {}",
          },
        },
        required: [
          "item_key",
          "value_ko",
          "value_native",
          "status",
          "evidence",
          "reason",
          "reason_native",
          "detail",
        ],
      },
    },
    form_fields: {
      type: "object",
      description:
        "재가(별지 제12호)만: total_minutes, body_trend, meal_trend, cognition_trend, stool_accidents, urine_accidents. 시설이면 {}",
    },
  },
  required: ["transcript_ko", "items", "form_fields"],
} as const;

// AI 규칙 v1.1.1 '도구 정의 (초안)'
export const AGENT_TOOLS = [
  {
    name: "get_form_spec",
    description:
      "어르신의 급여 종류에 맞는 서식(시설=별지 제16호, 재가=별지 제12호)의 칸, 선택지, 작성 기준을 가져온다. 칸을 채우기 전에 먼저 부른다.",
    input_schema: {
      type: "object",
      properties: {
        care_type: {
          type: "string",
          enum: ["facility", "home"],
          description: "facility=시설, home=재가",
        },
        why: { type: "string", description: "이 도구를 부르는 이유 한 줄" },
      },
      required: ["care_type", "why"],
    },
  },
  {
    name: "search_terms",
    description:
      "사투리, 일상 표현, 애매한 말을 교재 공식 용어와 고정 베트남어 번역으로 찾는다. 결과가 비면 뜻을 짐작하지 말고 그 항목을 needs_check로 둔다.",
    input_schema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "받아쓴 글에 나온 표현 그대로" },
        why: { type: "string", description: "이 도구를 부르는 이유 한 줄" },
      },
      required: ["expression", "why"],
    },
  },
  {
    name: "validate_draft",
    description:
      "초안을 서버 코드로 검사한다: 9개 항목과 JSON 형식, evidence가 원문에 있는지, observed인데 근거가 없는지, not_mentioned인데 내용이 있는지, 재가 제공시간 합이 방문 시간 이하인지, 실명이 있는지. 통과 여부와 문제 목록을 돌려준다.",
    input_schema: {
      type: "object",
      properties: {
        draft: DRAFT_SCHEMA,
        why: { type: "string", description: "이 도구를 부르는 이유 한 줄" },
      },
      required: ["draft", "why"],
    },
  },
  {
    name: "submit_draft",
    description:
      "완성한 초안을 저장하고 작업을 끝낸다. 서버가 저장 직전에 다시 검사하고, 남은 문제 항목은 needs_check로 낮춘다. 작업의 마지막에 꼭 한 번 부른다.",
    input_schema: {
      type: "object",
      properties: {
        draft: DRAFT_SCHEMA,
        why: { type: "string", description: "이 도구를 부르는 이유 한 줄" },
      },
      required: ["draft", "why"],
    },
  },
] as const;

// AI 규칙 v1.1.1 '프롬프트 초안'. 어르신 조건은 DB에 칸이 없어 급여 종류만 넣는다.
export function agentSystemPrompt(careType: CareType, nativeLang: "ko" | "vi") {
  return `너는 요양기관의 돌봄 기록 초안을 준비하는 Agent다.
외국인 요양보호사가 돌봄을 마친 뒤 말한 메모를 받아쓴 글을 보고,
9개 항목 초안을 만든다. 너의 결과는 초안이며, 작성자가 확인하고 담당자가 승인한다.

[어르신] 급여 종류: ${careType === "home" ? "재가" : "시설"}
[작성자 모국어] ${nativeLang}
[항목] visit_time, support, meal, sleep, discomfort, medication, cognition, notes, next_check

일하는 순서:
1. get_form_spec으로 서식 칸·선택지·작성 기준을 먼저 가져온다.
2. 사투리, 일상 표현, 애매한 말, 교재 용어가 필요한 말은 search_terms로 찾는다.
   한 번에 필요한 도구를 함께 부른다. 같은 도구에 같은 입력을 다시 넣지 않는다.
3. 초안을 만들고 validate_draft로 검사한다. 문제가 있으면 고친다.
4. 마지막에 submit_draft를 꼭 한 번 부른다. 응답은 최대 4번이다.
5. 도구를 부를 때마다 why에 이 도구를 부르는 이유를 한 줄로 쓴다.

규칙:
1. 원문에 없는 내용은 쓰지 않는다. 없으면 status=not_mentioned, value_ko="".
2. 내용을 쓴 항목은 evidence에 원문 문장을 한 글자도 바꾸지 않고 옮긴다.
3. 양·정도가 모호하거나, 사투리를 짐작했거나, search_terms 결과가 비었거나,
   말이 서로 맞지 않거나, 낙상·상처·호흡·의식·통증·복약 이상이 있으면
   status=needs_check이고 reason을 쓴다.
4. 진단하지 말고 본 것만 쓴다. 호전/유지/악화는 원문에 비교가 있을 때만.
5. value_ko는 한국어 기록체(~하심, ~드심), 교재 용어. value_native는 그 번역.
   reason을 쓰면 reason_native에 그 번역을 쓴다.
   용어 목록에 있는 말은 search_terms가 준 고정 번역만 쓴다.
   받아쓴 글은 한국어만, 모국어만, 둘이 섞인 말일 수 있다. 어느 경우든 value_ko는
   한국어로 쓰고, evidence는 원문 언어 그대로 옮긴다. transcript_ko는 원문 전체의 한국어 번역이다.
6. notes는 200자 안쪽을 목표로 한다.
7. 어르신·가족의 실명을 기록에 쓰지 않는다.
8. 재가면 form_fields도 채운다. 시설이면 form_fields는 빈 객체.
9. 서버 검사 결과를 이기려고 내용을 지어내지 않는다. 고칠 수 없으면 needs_check로 둔다.
10. 도구 결과 밖의 설명 문장은 쓰지 않는다. 초안은 submit_draft의 draft로만 낸다.`;
}

const summarize = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

// 형식 오류(고칠 수 없는 문제)면 기대하는 모양을 함께 돌려줘 다음 응답에서 바로 고치게 한다
const SHAPE_CODES = ["invalid_shape", "missing_item", "duplicate_item", "unknown_item"];
function shapeHint(result: { fixed: unknown; problems: { code: string }[] }) {
  if (result.fixed || !result.problems.some((p) => SHAPE_CODES.includes(p.code))) return {};
  return {
    expected_shape:
      '{"transcript_ko": "...", "items": [9개 객체, 순서대로 item_key=visit_time, support, meal, sleep, discomfort, medication, cognition, notes, next_check. 각각 value_ko, value_native, status, evidence, reason, reason_native, detail], "form_fields": {}}',
  };
}

const isTool = (name: string): name is AgentTool => AGENT_TOOLS.some((tool) => tool.name === name);

export async function runAgent(input: AgentInput, deps: AgentDeps): Promise<AgentResult> {
  const system = agentSystemPrompt(input.careType, input.nativeLang);
  const messages: AgentMessage[] = [{ role: "user", content: `[받아쓴 글]\n${input.transcript}` }];
  const cache = new Map<string, string>(); // 같은 도구·같은 입력은 한 번만 실행
  let lastDraft: unknown = null;
  let stepNo = 0;

  for (let response = 1; response <= MAX_RESPONSES; response++) {
    const reply = await deps.callClaude(system, messages);
    messages.push({ role: "assistant", content: reply.content });
    const uses = reply.content.filter((block): block is ToolUse => block.type === "tool_use");
    if (uses.length === 0) break;

    const results: ToolResult[] = [];
    let submitted: { downgraded: string[] } | null = null;
    for (const [index, use] of uses.entries()) {
      const started = deps.now();
      const { why, ...args } = use.input;
      const cacheKey = `${use.name}:${JSON.stringify(args)}`;
      let output = cache.get(cacheKey);
      const repeated = output !== undefined;
      if (output === undefined) {
        output = await runToolWithRetry(use, input, deps, (draft) => (lastDraft = draft));
        cache.set(cacheKey, output);
      }
      if (use.name === "submit_draft" && !repeated) {
        const parsed = JSON.parse(output) as { saved?: boolean; downgraded?: string[] };
        if (parsed.saved) submitted = { downgraded: parsed.downgraded ?? [] };
      }
      if (isTool(use.name)) {
        stepNo += 1;
        await deps.logStep({
          step_no: stepNo,
          tool: use.name,
          input_summary: summarize(args),
          result_summary: repeated ? `같은 입력 반복: 앞 결과를 돌려줌` : summarize(output),
          reason: typeof why === "string" ? why : "",
          duration_ms: deps.now() - started,
          tokens: index === 0 ? reply.tokens : null,
        });
      }
      results.push({ type: "tool_result", tool_use_id: use.id, content: output });
    }
    if (submitted) return { endReason: "draft_returned", downgraded: submitted.downgraded };

    // 상한에 닿기 전에 끝내도록 돕는다(멈춤 규칙 5)
    if (response === MAX_RESPONSES - 1 && results.length > 0) {
      const last = results[results.length - 1];
      last.content = `${last.content}\n다음 응답에서 submit_draft를 불러야 함`;
    }
    messages.push({ role: "user", content: results });
  }

  // 4번 안에 초안 반환이 없음: 마지막 초안을 검증해 저장하고, 못 정한 항목은 '확인 필요' + 자동 정리 중단
  const saved = await deps.saveDraft(autoStopDraft(lastDraft, input));
  return { endReason: "auto_stopped", downgraded: saved.downgraded };
}

async function runToolWithRetry(
  use: ToolUse,
  input: AgentInput,
  deps: AgentDeps,
  rememberDraft: (draft: unknown) => void,
): Promise<string> {
  // 도구 실패(시간 초과 등)는 한 번 다시 실행하고, 또 실패하면 처리 실패로 끝낸다(멈춤 규칙 4)
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runTool(use, input, deps, rememberDraft);
    } catch (error) {
      lastError = error;
    }
  }
  throw new ToolFailedError(use.name, lastError);
}

async function runTool(
  use: ToolUse,
  input: AgentInput,
  deps: AgentDeps,
  rememberDraft: (draft: unknown) => void,
): Promise<string> {
  switch (use.name) {
    case "get_form_spec": {
      const careType = use.input.care_type === "home" ? "home" : input.careType;
      return JSON.stringify(getFormSpec(careType));
    }
    case "search_terms": {
      const expression = typeof use.input.expression === "string" ? use.input.expression : "";
      return JSON.stringify(expression ? await deps.searchTerms(expression) : []);
    }
    case "validate_draft": {
      rememberDraft(use.input.draft);
      const result = validateDraft(use.input.draft, input.context);
      return JSON.stringify({
        passed: result.passed,
        problems: result.problems,
        ...shapeHint(result),
      });
    }
    case "submit_draft": {
      rememberDraft(use.input.draft);
      const check = validateDraft(use.input.draft, input.context);
      // 형식이 깨져 고칠 수 없으면 저장하지 않고 문제 목록을 돌려준다
      if (!check.fixed) {
        return JSON.stringify({ saved: false, problems: check.problems, ...shapeHint(check) });
      }
      const saved = await deps.saveDraft(use.input.draft);
      return JSON.stringify({ saved: true, downgraded: saved.downgraded });
    }
    default:
      return JSON.stringify({ error: `알 수 없는 도구: ${use.name}` });
  }
}

/** 자동 정리 중단 초안: 마지막 초안을 고쳐 쓰고, 문제가 남은 항목은 '확인 필요' + 자동 정리 중단 */
export function autoStopDraft(lastDraft: unknown, input: AgentInput): Draft {
  const reasonNative = input.nativeLang === "vi" ? REASONS_VI[AUTO_STOP_REASON] : "";
  const check = lastDraft ? validateDraft(lastDraft, input.context) : null;
  if (!check?.fixed) return allNeedsCheckDraft(AUTO_STOP_REASON, "", input.nativeLang);
  const unresolved = new Set([
    ...check.downgraded,
    ...check.problems.map((problem) => problem.item_key).filter(Boolean),
  ]);
  return {
    ...check.fixed,
    items: check.fixed.items.map((item) =>
      unresolved.has(item.item_key)
        ? { ...item, status: "needs_check", reason: AUTO_STOP_REASON, reason_native: reasonNative }
        : item,
    ),
  };
}
