import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Native } from "@/components/mobile/native";
import { nativeMessage } from "./messages";

describe("모국어 화면 문구", () => {
  it("키가 빠지거나 한국어 계정이면 병기 줄을 그리지 않는다", () => {
    expect(renderToStaticMarkup(<Native id="missing.key" language="vi" />)).toBe("");
    expect(renderToStaticMarkup(<Native id="a1.signIn" language="ko" />)).toBe("");
  });

  it("언어 속성과 원래 번역을 유지한다", () => {
    expect(renderToStaticMarkup(<Native id="a1.signIn" language="vi" />)).toBe(
      '<span class="native" lang="vi">Đăng nhập</span>',
    );
  });

  it("역할 이름은 값으로 넣고, 값이 없으면 줄을 숨긴다", () => {
    expect(nativeMessage("vi", "a2.codeHint", { reviewer: "giảng viên" })).toBe(
      "Mã do giảng viên cấp",
    );
    expect(nativeMessage("vi", "a2.codeHint")).toBe("");
    expect(nativeMessage("ko", "a1.signIn")).toBe("");
  });
});
