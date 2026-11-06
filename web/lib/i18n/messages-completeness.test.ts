import { describe, expect, it } from "vitest";

import { roleNames } from "@/lib/demo/roles";

import { nativeMessage } from "./messages";
import { en } from "./messages/en";
import { mn } from "./messages/mn";
import { vi } from "./messages/vi";
import { zh } from "./messages/zh";

// 이슈 #351: zh·mn·en을 vi와 같은 키로 채움, {Reviewer} 대문자 자리
const TABLES = { zh, mn, en } as Record<string, Record<string, string>>;
const VI = vi as Record<string, string>;
const holders = (text: string) =>
  new Set([...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name.toLowerCase()));

describe("번역 표 완전성", () => {
  it.each(Object.keys(TABLES))("%s 키 집합 = vi 키 집합", (lang) => {
    expect(Object.keys(TABLES[lang]).sort()).toEqual(Object.keys(VI).sort());
  });

  it.each(["vi", ...Object.keys(TABLES)])("%s에 빈 문구가 없다", (lang) => {
    const table = lang === "vi" ? VI : TABLES[lang];
    expect(Object.entries(table).filter(([, text]) => !text.trim())).toEqual([]);
  });

  it.each(Object.keys(TABLES))("%s 자리표시자 ⊆ vi 자리표시자(대소문자 무시)", (lang) => {
    const extra = Object.entries(TABLES[lang]).flatMap(([key, text]) =>
      [...holders(text)]
        .filter((name) => !holders(VI[key] ?? "").has(name))
        .map((n) => `${key}:${n}`),
    );
    expect(extra).toEqual([]);
  });

  it("mn의 {reviewer}·{worker} 뒤에는 격 어미를 붙이지 않는다(주격 자리만)", () => {
    const glued = Object.entries(TABLES.mn).filter(([, text]) =>
      /\{(reviewer|worker)\}[-\p{L}]/iu.test(text),
    );
    expect(glued).toEqual([]);
  });
});

describe("nativeMessage {Reviewer} 대문자 자리", () => {
  it("대문자 자리는 같은 이름 값을 대문자로 시작한다(라틴·키릴)", () => {
    expect(nativeMessage("en", "w4.badge.confirmed", { reviewer: "manager" })).toBe(
      "Manager confirmed",
    );
    expect(nativeMessage("mn", "w4.badge.confirmed", { reviewer: "менежер" })).toBe(
      "Менежер баталгаажуулсан",
    );
    expect(nativeMessage("vi", "w4.badge.omitted", { reviewer: "người quản lý" })).toBe(
      "Người quản lý chọn không ghi",
    );
  });

  it("소문자 자리는 값을 그대로 둔다", () => {
    expect(nativeMessage("vi", "w1.noAssignment", { reviewer: "người quản lý" })).toMatch(
      /hỏi người quản lý\.$/,
    );
    expect(nativeMessage("en", "w4.view.waiting", { reviewer: "manager" })).toBe(
      "Waiting for your manager to review it.",
    );
  });

  it("한자는 대문자 처리에 영향이 없다", () => {
    expect(nativeMessage("zh", "w4.badge.confirmed", { reviewer: "管理员" })).toBe("管理员已确认");
  });

  it("대문자 이름을 직접 넘기면 그 값을 그대로 쓴다", () => {
    expect(nativeMessage("en", "w4.badge.confirmed", { Reviewer: "Lead" })).toBe("Lead confirmed");
  });

  it("값이 없거나 빈칸이면 빈 문자열(한국어만 보임)", () => {
    expect(nativeMessage("en", "w4.badge.confirmed")).toBe("");
    expect(nativeMessage("en", "w4.badge.confirmed", { reviewer: "" })).toBe("");
  });

  it.each(["vi", "zh", "mn", "en"] as const)(
    "%s: 바뀐 문장 틀이 일반·교육용 모두 자리표시자 없이 렌더된다",
    (lang) => {
      const keys = [
        "w4.archive.expiryHint",
        "w4.archive.lateHint",
        "w6.safetyHint",
        "w5.ai.safetyHint",
        "w3.needsCheckHint",
        "w3.reviewerChanged",
        "w3.sent.description",
        "w1.noAssignment",
        "w5.ai.worker.title",
        "w5.ai.reviewer.title",
        "w4.view.approved",
        "w4.view.waiting",
        "w4.badge.confirmed",
        "w4.badge.omitted",
      ];
      for (const training of [false, true]) {
        const names = roleNames(training, lang);
        for (const key of keys) {
          const text = nativeMessage(lang, key, {
            reviewer: names.reviewerNative,
            worker: names.workerNative,
          });
          expect(text, key).not.toBe("");
          expect(text, key).not.toMatch(/[{}]|\s{2}|\s[.,。]/);
        }
      }
    },
  );

  it("vi 문장은 바꾸기 전 조각 잇기와 같다(w6.safetyHint만 'trước' 추가)", () => {
    const r = "người quản lý";
    expect(nativeMessage("vi", "w6.safetyHint", { reviewer: r })).toBe(
      "Khi có vấn đề sức khỏe hoặc an toàn, hãy báo người quản lý trước.",
    );
    expect(nativeMessage("vi", "w3.needsCheckHint", { reviewer: r })).toBe(
      "Vẫn gửi được khi còn mục cần kiểm tra. Người quản lý sẽ quyết định.",
    );
    expect(nativeMessage("vi", "w4.archive.expiryHint", { reviewer: r })).toBe(
      "Sau 7 ngày sẽ không thể viết. Khi đó hãy báo người quản lý.",
    );
  });
});
