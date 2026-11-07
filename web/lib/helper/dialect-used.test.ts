import { describe, expect, it } from "vitest";

import { roleNames } from "@/lib/demo/roles";

import { type GlossaryTerm, safetyNotice, withDialectNotice, withSafetyNotice } from "./ask";
import { HELPER_FIXED } from "./fixed-text";

// 이슈 #392: 사투리 줄을 '썼을 때'만 짐작 안내·우리말샘 출처를 붙인다(A안+C안). 커밋하지 않는 검토용 테스트.
const GUESS_KO = "사투리 풀이는 사전의 짐작이에요.";
const GUESS_VI = HELPER_FIXED.vi!.dialectGuess;

const dialect = (over: Partial<GlossaryTerm> = {}): GlossaryTerm => ({
  matched_expression: "정구지",
  term_ko: "부추",
  term_native: "",
  plain_ko: "부추를 이르는 말",
  chapter: "우리말샘(경상 방언)",
  page: "",
  ...over,
});
const textbook = {
  ko: "식사를 거부하시면 이유를 차분히 여쭤보세요.",
  native: "Hãy nhẹ nhàng hỏi lý do.",
  source: "10장 3절 식사 돕기",
  found: true,
};

describe("withDialectNotice 썼는지 판단(#392)", () => {
  it("사투리 줄을 찾았지만 교재로 답했으면 안내·우리말샘 출처를 붙이지 않는다", () => {
    expect(withDialectNotice(textbook, [dialect()], "vi")).toEqual(textbook);
  });

  it("사투리 풀이를 쓴 답(A)이면 ko·native 안내와 출처를 붙인다", () => {
    const used = {
      ko: "'정구지'는 부추를 말해요.",
      native: "Có vẻ nghĩa là đã vất vả.",
      source: null,
      found: true,
    };
    const out = withDialectNotice(used, [dialect()], "vi");
    expect(out.ko).toBe(`${used.ko} ${GUESS_KO}`);
    expect(out.native).toBe(`${used.native} ${GUESS_VI}`);
    expect(out.source).toBe("우리말샘(경상 방언)");
  });

  it("말은 안 옮겼지만 모델이 '짐작'이라고 밝혔으면(C) 찾은 사투리 줄 출처를 붙인다", () => {
    const guessed = { ...textbook, ko: "그 말은 힘들었다는 뜻으로 짐작돼요." };
    const out = withDialectNotice(guessed, [dialect()], "vi");
    expect(out.ko).toBe(guessed.ko); // 이미 '짐작'이 있어 다시 붙이지 않음
    expect(out.native).toBe(`${guessed.native} ${GUESS_VI}`);
    expect(out.source).toBe("10장 3절 식사 돕기, 우리말샘(경상 방언)");
  });

  it("저장된 옛 답에 잘못 붙은 안내·우리말샘 출처는 이번에 '안 씀'이면 걷어 낸다", () => {
    const stored = {
      ...textbook,
      ko: `${textbook.ko} ${GUESS_KO}`,
      native: `${textbook.native} ${GUESS_VI}`,
      source: "10장 3절 식사 돕기, 우리말샘(경상 방언)",
    };
    expect(withDialectNotice(stored, [dialect()], "vi", { reused: true })).toEqual(textbook);
  });

  it("모델이 쓴 ';' 구분자는 유지하고 '[용어]'만 뺀다", () => {
    const out = withDialectNotice(
      { ...textbook, ko: "정구지는 부추를 말해요.", source: "5장 2절; 10장; [용어]" },
      [dialect()],
      "vi",
    );
    expect(out.source).toBe("5장 2절; 10장, 우리말샘(경상 방언)");
  });

  it("ko 작성자는 native가 빈칸 그대로", () => {
    const out = withDialectNotice(
      { ko: "정구지는 부추를 말해요.", native: "", source: null, found: true },
      [dialect()],
      "ko",
    );
    expect(out.ko).toContain(GUESS_KO);
    expect(out.native).toBe("");
  });

  it("안전 안내는 앞에, 사투리 안내는 뒤에 붙어 서로 지우지 않는다", () => {
    const used = {
      ko: "정구지는 부추를 말해요.",
      native: "Vất vả.",
      source: null,
      found: true,
    };
    const notice = safetyNotice(roleNames(false), "vi");
    const out = withSafetyNotice(withDialectNotice(used, [dialect()], "vi"), notice);
    expect(out.ko.startsWith(notice.ko)).toBe(true);
    expect(out.ko.endsWith(GUESS_KO)).toBe(true);
    expect(out.native.startsWith(notice.native)).toBe(true);
    expect(out.native.endsWith(GUESS_VI)).toBe(true);
  });
});

describe("경계값: 재검토에서 찾은 오탐·미탐(#392)", () => {
  it("(한계) 활용한 동사(욕보다→욕봤다)는 글자 비교로 못 찾아, 모델이 '짐작'을 안 쓰면 안내가 빠진다", () => {
    const term = dialect({
      matched_expression: "욕보다",
      term_ko: "수고하다",
      plain_ko: "어렵고 힘든 일을 겪다",
    });
    const answer = {
      ko: "'욕봤다'는 수고했다는 뜻으로 보여요.",
      native: "",
      source: null,
      found: true,
    };
    expect(withDialectNotice(answer, [term], "ko")).toEqual(answer);
  });

  it("흔한 두 글자 표준말(거시기→그것)은 교재 답의 '그것을'에 걸리지 않는다", () => {
    const term = dialect({
      matched_expression: "거시기",
      term_ko: "그것",
      plain_ko: "이름이 생각나지 않는 사물",
    });
    const answer = { ...textbook, ko: "그것을 먼저 확인하세요." };
    expect(withDialectNotice(answer, [term], "vi")).toEqual(answer);
  });

  it("풀이 마디('피곤하')가 있어도 답이 풀이하는 말(뜻·의미)을 안 쓰면 붙지 않는다", () => {
    const term = dialect({
      matched_expression: "고단타",
      term_ko: "고단하다",
      plain_ko: "몸이 지치고 피곤하다",
    });
    const out = withDialectNotice(
      { ...textbook, ko: "피곤하실 수 있으니 쉬게 해 드리세요." },
      [term],
      "vi",
    );
    expect(out.source).not.toContain("우리말샘");
    expect(out.ko).not.toContain(GUESS_KO);
  });

  it("교재 답의 '짐작하기'는 C로 보지 않는다", () => {
    const out = withDialectNotice(
      { ...textbook, ko: "통증 정도를 짐작하기 어려우면 관리자에게 알리세요." },
      [dialect()],
      "vi",
    );
    expect(out.source).not.toContain("우리말샘");
  });

  it("새 답에서 모델이 출처에 우리말샘을 직접 쓰면 썼다로 보고, 출처는 구분자까지 그대로 둔다", () => {
    const out = withDialectNotice(
      { ...textbook, source: "5장 2절; 우리말샘(경상 방언)" },
      [dialect()],
      "vi",
    );
    expect(out.source).toBe("5장 2절; 우리말샘(경상 방언)");
    expect(out.ko).toContain(GUESS_KO);
  });

  it("새 답의 출처가 우리말샘 하나면 썼다로 보고, 저장된 답이면 걷어 내고 다시 판단한다", () => {
    const out = withDialectNotice(
      { ...textbook, source: "우리말샘(경상 방언)" },
      [dialect()],
      "vi",
    );
    expect(out.ko).toContain(GUESS_KO);
    const reused = withDialectNotice(
      { ...textbook, source: "우리말샘(경상 방언)" },
      [dialect()],
      "vi",
      { reused: true },
    );
    expect(reused.source).toBeNull();
    expect(reused.ko).not.toContain(GUESS_KO);
  });
});
