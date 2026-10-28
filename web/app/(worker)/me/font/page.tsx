"use client";

// 글자 크기(피그마 M20·M29): 3단계, 미리보기 뒤 [적용].
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { BtnLabel } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen } from "@/components/mobile/shell";
import type { FontSize } from "@/lib/demo/store";

const options: { key: FontSize; ko: string; px: number }[] = [
  { key: "small", ko: "작게", px: 15 },
  { key: "normal", ko: "보통", px: 18 },
  { key: "large", ko: "크게", px: 24 },
];
const zoom: Record<FontSize, number> = { small: 0.92, normal: 1, large: 1.15 };

export default function FontPage() {
  const demo = useDemo();
  const router = useRouter();
  const [picked, setPicked] = useState<FontSize | null>(null);
  if (!demo) return <Loading tab="me" />;
  const size = picked ?? demo.db.fontSize;

  return (
    <MobileScreen tab="me">
      <AppBar title="글자 크기" vi="Kích thước chữ" back="/me" />
      <div className="center" style={{ marginTop: 12 }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>읽기 편한 글자 크기를 선택해 주세요.</p>
        <span className="vi" style={{ fontSize: 13 }}>
          Chọn cỡ chữ dễ đọc nhất cho bạn.
        </span>
      </div>
      <section className="preview card" style={{ zoom: zoom[size] }}>
        <span className="badge badge-green" style={{ alignSelf: "flex-start" }}>
          미리보기
        </span>
        <h3>돌봄 기록</h3>
        <div className="sample">
          <b>식사</b>
          <p>아침 식사를 잘하셨어요.</p>
          <span className="vi">Bữa sáng diễn ra tốt.</span>
        </div>
      </section>
      <h2 className="section-title" style={{ margin: "24px 20px 4px" }}>
        글자 크기 선택
      </h2>
      <p style={{ margin: "0 20px 12px", fontSize: 13, color: "var(--color-muted)" }}>
        앱 전체에 똑같이 적용돼요.
      </p>
      <div className="size-grid" role="radiogroup" aria-label="글자 크기">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={size === option.key}
            className={`size-card ${size === option.key ? "on" : ""}`}
            style={{ font: "inherit", cursor: "pointer" }}
            onClick={() => setPicked(option.key)}
          >
            <b style={{ fontSize: option.px }}>Aa</b>
            {option.ko}
          </button>
        ))}
      </div>
      <div className="pad" style={{ marginTop: "auto", padding: "24px 16px" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            // 실제 모드는 profiles.font_size에 저장해 다른 기기·다시 로그인해도 남는다
            if (demo.real) void demo.real.actions.setProfile({ fontSize: size });
            else demo.update((db) => ({ ...db, fontSize: size }));
            router.push("/me");
          }}
        >
          <BtnLabel ko="적용" vi="Áp dụng" />
        </button>
      </div>
    </MobileScreen>
  );
}
