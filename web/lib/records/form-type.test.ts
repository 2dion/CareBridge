import { describe, expect, it } from "vitest";

import { careTypeOf, toFormType } from "./form-type";

describe("form_type 변환 (DB smallint ↔ 계약 글자)", () => {
  it('숫자 12와 글자 "12"는 모두 재가(12)', () => {
    expect(toFormType(12)).toBe("12");
    expect(toFormType("12")).toBe("12");
    expect(careTypeOf(12)).toBe("home");
    expect(careTypeOf("12")).toBe("home");
  });

  it('숫자 16·글자 "16"·그 밖의 값은 시설(16)', () => {
    expect(toFormType(16)).toBe("16");
    expect(toFormType("16")).toBe("16");
    expect(toFormType(null)).toBe("16");
    expect(careTypeOf(16)).toBe("facility");
  });
});
