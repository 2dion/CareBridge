import { describe, expect, it } from "vitest";

import { DEFAULTS, getAiMode, getAiModels, getConfigStatus } from "./config";

describe("getAiMode", () => {
  it("USE_MOCK_AI가 없으면 Mock", () => {
    expect(getAiMode({})).toBe("mock");
  });

  it("USE_MOCK_AI=false일 때만 실제 호출", () => {
    expect(getAiMode({ USE_MOCK_AI: "false" })).toBe("real");
    expect(getAiMode({ USE_MOCK_AI: "true" })).toBe("mock");
    expect(getAiMode({ USE_MOCK_AI: "0" })).toBe("mock");
  });
});

describe("getAiModels", () => {
  it("비어 있으면 기본 모델", () => {
    expect(getAiModels({})).toEqual({
      main: DEFAULTS.modelMain,
      light: DEFAULTS.modelLight,
    });
  });
});

describe("getConfigStatus", () => {
  it("키 없는 로컬 개발은 문제 없음", () => {
    expect(getConfigStatus({}).problems).toEqual([]);
  });

  it("Production에서 Mock이면 문제로 알림", () => {
    const status = getConfigStatus({ VERCEL_ENV: "production" });
    expect(status.problems).toHaveLength(1);
  });

  it("실제 호출인데 키가 없으면 문제로 알림", () => {
    const status = getConfigStatus({ USE_MOCK_AI: "false" });
    expect(status.claudeKeySet).toBe(false);
    expect(status.sttKeySet).toBe(false);
    expect(status.problems).toHaveLength(2);
  });

  it("키 값 자체는 결과에 담지 않음", () => {
    const status = getConfigStatus({
      USE_MOCK_AI: "false",
      ANTHROPIC_AUTH_TOKEN: "secret-value",
      GROQ_API_KEY: "secret-value",
    });
    expect(JSON.stringify(status)).not.toContain("secret-value");
    expect(status.problems).toEqual([]);
  });
});
