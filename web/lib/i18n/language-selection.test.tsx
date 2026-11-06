import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Native, NativeLanguageProvider } from "@/components/mobile/native";
import { BtnLabel } from "@/components/mobile/parts";
import { LanguageSelect } from "@/components/mobile/language-select";
import { CapsLockNote } from "@/components/mobile/caps-lock";
import { createDemoDb, ensureRecord, fillMockDraft } from "@/lib/demo/store";
import { mockHelperAnswer } from "@/lib/demo/helper";
import { roleNames } from "@/lib/demo/roles";
import { nativeMessage } from "./messages";

const render = (language: "ko" | "vi" | "zh" | "mn" | "en") =>
  renderToStaticMarkup(
    <NativeLanguageProvider language={language}>
      <Native id="a2.signUp" />
      <BtnLabel ko="가입하기" nativeId="a2.signUp" always />
      <CapsLockNote on />
      <Native id="missing.key" />
    </NativeLanguageProvider>,
  );

describe("A2·W5 모국어 선택(#313)", () => {
  it("A2에서 선택한 언어가 공통 버튼과 Caps Lock 안내까지 적용된다", () => {
    for (const language of ["vi", "zh", "mn", "en"] as const) {
      const html = render(language);
      expect(html).toContain(`lang="${language}"`);
      expect(html).toContain(nativeMessage(language, "a2.signUp"));
      if (language !== "vi") expect(html).not.toContain('lang="vi"');
    }
    expect(render("ko")).not.toContain('lang="');
    expect(render("ko")).not.toContain('class="native"');
  });

  it("A2·W5 공통 목록은 QA 전 언어를 선택지로 열지 않는다", () => {
    const html = renderToStaticMarkup(
      <LanguageSelect id="language" value="vi" label="모국어" onChange={() => {}} />,
    );
    expect(html).toContain('value="ko"');
    expect(html).toContain('value="vi"');
    for (const language of ["zh", "mn", "en"]) expect(html).not.toContain(`value="${language}"`);
  });

  it("번역 초안에 없는 키는 다른 언어를 대신 쓰지 않고 숨긴다", () => {
    // zh·mn·en도 vi와 같은 키를 갖는다(#351). 없는 키·빈 매개변수는 다른 언어로 대신하지 않고 빈칸
    for (const language of ["zh", "mn", "en"] as const) {
      const hint = nativeMessage(language, "w3.remainingHint", { count: 9 });
      expect(hint).toContain("9");
      expect(hint).not.toBe(nativeMessage("vi", "w3.remainingHint", { count: 9 }));
      expect(nativeMessage(language, "없는.키")).toBe("");
      expect(roleNames(false, language).reviewerNative).not.toBe(
        roleNames(false, "vi").reviewerNative,
      );
      const helper = mockHelperAnswer("식사를 안 드셔요", language).native;
      expect(helper).not.toBe("");
      expect(helper).not.toBe(mockHelperAnswer("식사를 안 드셔요", "vi").native);
    }
    expect(nativeMessage("vi", "a2.codeHint", { reviewer: "" })).toBe("");
    expect(
      renderToStaticMarkup(
        <NativeLanguageProvider language="en">
          <Native requiredIds={["없는.키" as never]}>saved</Native>
        </NativeLanguageProvider>,
      ),
    ).toBe("");
  });

  it("언어가 바뀌면 기록 내용·이유·되돌림 사유 번역을 숨기고 같은 언어면 보인다", () => {
    const line = (language: "ko" | "vi" | "en") =>
      renderToStaticMarkup(
        <NativeLanguageProvider language={language}>
          <Native recordLanguage="vi">옛 기록 번역</Native>
        </NativeLanguageProvider>,
      );
    expect(line("vi")).toContain("옛 기록 번역");
    expect(line("en")).toBe("");
    expect(line("ko")).toBe("");
  });

  it("Mock 계정 언어 변경은 옛 기록 언어를 보존하고 새 기록에만 적용한다", () => {
    const db = createDemoDb("2026-11-05");
    const before = Object.values(db.records)[0];
    db.worker.nativeLang = "ko";
    const next = ensureRecord(db, "kim", "2026-11-05", "2026-11-05", "2026-11-05T10:00:00+09:00");
    expect(next).not.toHaveProperty("error");
    if ("error" in next) return;
    const filled = fillMockDraft(next.db, next.id, "2026-11-05T10:01:00+09:00");
    expect(filled.records[before.id].nativeLang).toBe("vi");
    expect(filled.records[next.id].nativeLang).toBe("ko");
    expect(
      filled.records[next.id].items.every((item) => !item.value_native && !item.reason_native),
    ).toBe(true);
  });
});
