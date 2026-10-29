"use client";

// W5(내 정보): 글자 크기, 사용 안내 다시 보기, AI 사용 원칙, 개인정보 안내, 로그아웃.
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useDemo } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon, type IconName } from "@/components/mobile/icon";
import { AppBar, FrameVi, Loading, MobileScreen } from "@/components/mobile/shell";
import { signOut } from "@/lib/auth/session";

const fontLabel = { small: "작게", normal: "보통", large: "크게" } as const;

export default function MePage() {
  const demo = useDemo();
  const router = useRouter();
  if (!demo) return <Loading tab="me" />;
  const { db } = demo;

  const rows: {
    href: string;
    icon: IconName;
    ko: string;
    vi: string;
    extra?: string;
    sub?: string;
  }[] = [
    {
      href: "/me/font",
      icon: "settings",
      ko: "글자 크기",
      vi: "Cỡ chữ",
      extra: fontLabel[db.fontSize],
      sub: `지금: ${fontLabel[db.fontSize]}`,
    },
    { href: "/guide", icon: "book", ko: "사용 안내 다시 보기", vi: "Xem lại hướng dẫn" },
    { href: "/me/ai", icon: "sparkle", ko: "AI 사용 원칙", vi: "Nguyên tắc sử dụng AI" },
    { href: "/me/privacy", icon: "shield", ko: "개인정보 안내", vi: "Thông tin quyền riêng tư" },
  ];

  const logout = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <MobileScreen tab="me">
      <AppBar title="내 정보" vi="Thông tin của tôi" />
      <section
        className="card"
        style={{
          margin: "8px 16px 0",
          padding: 16,
          display: "flex",
          gap: 14,
          alignItems: "center",
        }}
      >
        <Art name="robot-face" width={64} className="art" />
        <div>
          <b style={{ fontSize: 18 }}>{db.worker.name}</b>{" "}
          <span className="badge badge-green">작성자</span>
          <p style={{ fontSize: 14, color: "var(--color-sub)" }}>{db.worker.org}</p>
          <p style={{ fontSize: 13, color: "var(--color-muted)" }}>{db.worker.email}</p>
        </div>
      </section>
      <h2 className="section-title" style={{ margin: "22px 20px 8px" }}>
        설정
        <FrameVi className="vi">Cài đặt</FrameVi>
      </h2>
      <nav className="card" style={{ margin: "0 16px", padding: "4px 0" }} aria-label="설정">
        {rows.map((row) => (
          <Link key={row.href} href={row.href} className="settings-row">
            <span className="icon-bubble">
              <Icon name={row.icon} />
            </span>
            <span className="grow">
              <b>{row.ko}</b>
              <FrameVi>{row.vi}</FrameVi>
              {row.sub && <small>{row.sub}</small>}
            </span>
            {row.extra && <span className="extra">{row.extra}</span>}
            <Icon name="next" />
          </Link>
        ))}
      </nav>
      <button type="button" className="card settings-row logout" onClick={logout}>
        <Icon name="logout" />
        <span className="grow">
          <b>로그아웃</b>
          <FrameVi>Đăng xuất</FrameVi>
        </span>
        <Icon name="next" />
      </button>
    </MobileScreen>
  );
}
