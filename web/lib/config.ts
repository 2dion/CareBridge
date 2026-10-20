// 서버 환경 변수를 한 곳에서 읽는다. 값(키)은 돌려주지 않고 "있는지"만 알린다.
// 근거: 문서/설계/코디세이api-v1.0.md §2, 문서/결정/2026-10-20-stt-groq.md
// server-only를 넣지 않은 이유: 테스트(Vitest)에서 바로 불러 검사하기 위해서. 키를 읽는 코드는 lib/ai, lib/stt에 둔다.

type Env = Record<string, string | undefined>;

export const DEFAULTS = {
  anthropicBaseUrl: "https://copa.codyssey.kr",
  modelMain: "claude-sonnet-4",
  modelLight: "claude-haiku-4",
  sttBaseUrl: "https://api.groq.com/openai/v1",
  sttModel: "whisper-large-v3",
} as const;

export type AiMode = "mock" | "real";

export type ConfigStatus = {
  aiMode: AiMode;
  isProduction: boolean;
  claudeKeySet: boolean;
  sttKeySet: boolean;
  supabaseSet: boolean;
  problems: string[];
};

// USE_MOCK_AI가 "false"일 때만 실제 호출. 비어 있으면 Mock (키 없이도 돌아가게).
export function getAiMode(env: Env = process.env): AiMode {
  return env.USE_MOCK_AI?.trim().toLowerCase() === "false" ? "real" : "mock";
}

export function isProduction(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

export function getAiModels(env: Env = process.env) {
  return {
    main: env.AI_MODEL_MAIN || DEFAULTS.modelMain,
    light: env.AI_MODEL_LIGHT || DEFAULTS.modelLight,
  };
}

export function getConfigStatus(env: Env = process.env): ConfigStatus {
  const aiMode = getAiMode(env);
  const production = isProduction(env);
  const claudeKeySet = Boolean(env.ANTHROPIC_AUTH_TOKEN);
  const sttKeySet = Boolean(env.GROQ_API_KEY);
  const supabaseSet = Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  const problems: string[] = [];
  if (production && aiMode === "mock") {
    problems.push("Production에서 USE_MOCK_AI가 false가 아닙니다.");
  }
  if (aiMode === "real" && !claudeKeySet) {
    problems.push("USE_MOCK_AI=false인데 ANTHROPIC_AUTH_TOKEN이 없습니다.");
  }
  if (aiMode === "real" && !sttKeySet) {
    problems.push("USE_MOCK_AI=false인데 GROQ_API_KEY가 없습니다.");
  }
  if (aiMode === "real" && env.ANTHROPIC_API_KEY) {
    problems.push(
      "ANTHROPIC_API_KEY가 있습니다. 코디세이는 x-api-key를 거절하니 ANTHROPIC_AUTH_TOKEN만 씁니다.",
    );
  }

  return {
    aiMode,
    isProduction: production,
    claudeKeySet,
    sttKeySet,
    supabaseSet,
    problems,
  };
}
