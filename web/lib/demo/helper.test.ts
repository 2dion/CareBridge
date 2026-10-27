import { describe, expect, it } from "vitest";

import { mockHelperAnswer } from "./helper";

describe("도우미 Mock 답변", () => {
  it("사례 질문은 교재 출처와 함께 답한다", () => {
    const answer = mockHelperAnswer("어르신이 밥을 안 드시려고 해요");
    expect(answer.found).toBe(true);
    expect(answer.source).toContain("교재");
    expect(answer.vi).not.toBe("");
  });

  it("용어표 표현은 교재 용어로 풀어 준다", () => {
    const answer = mockHelperAnswer("세수해 드렸어요는 어떻게 써요?");
    expect(answer.found).toBe(true);
    expect(answer.ko).toContain("세면도움");
  });

  it("교재에 없으면 지어내지 않고 못 찾았다고 한다", () => {
    const answer = mockHelperAnswer("어르신 약 먹는 시간을 바꿔도 되나요?");
    expect(answer.found).toBe(false);
    expect(answer.source).toBeNull();
  });
});
