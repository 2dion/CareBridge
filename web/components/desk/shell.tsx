"use client";

// 담당자 화면(R1~R4) 공통 틀: 왼쪽 메뉴, 오른쪽 본문. 담당자 화면은 한국어만(화면틀병기 결정).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Icon, type IconName } from "@/components/mobile/icon";
import { signOut } from "@/lib/auth/session";
import { reviewQueue } from "@/lib/demo/review";
import { kstDateOf } from "@/lib/demo/store";

export type DeskNav = "review" | "approved" | "residents" | "settings";

const navItems: { key: DeskNav; href: string; label: string; icon: IconName }[] = [
  { key: "review", href: "/review", label: "검토 대기", icon: "list" },
  { key: "approved", href: "/approved", label: "승인한 기록", icon: "check" },
  { key: "residents", href: "/residents", label: "어르신·작성자", icon: "users" },
  { key: "settings", href: "/settings", label: "설정", icon: "settings" },
];

export function DeskShell({ active, children }: { active: DeskNav | null; children: ReactNode }) {
  const router = useRouter();
  const demo = useDemo();
  const waiting = demo ? reviewQueue(demo.db).length : 0;
  const name = demo?.db.reviewer.name ?? "";
  return (
    <div className="d-app">
      <aside className="side-nav">
        <div className="brand">
          <b>CareBridge</b>
          <span>{demo?.db.worker.org ?? "데모 요양센터"} · 담당자</span>
        </div>
        <nav aria-label="담당자 메뉴">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`nav-item ${item.key === active ? "on" : ""}`}
              aria-current={item.key === active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.key === "review" && waiting > 0 && <span className="count">{waiting}</span>}
            </Link>
          ))}
        </nav>
        <div className="me-card">
          <span className="mini-avatar">{name.slice(0, 1)}</span>
          <div>
            <b>{name}</b>
            <small>담당자</small>
          </div>
        </div>
        <button
          type="button"
          className="logout"
          onClick={async () => {
            await signOut();
            router.push("/login");
          }}
        >
          <Icon name="logout" />
          로그아웃
        </button>
      </aside>
      <main className="main">{demo ? children : <p className="sr-only">불러오는 중</p>}</main>
    </div>
  );
}

/** 잠깐 떴다 사라지는 알림(복사됨, 승인함 등). */
export function useToast() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const timer = window.setTimeout(() => setText(null), 2400);
    return () => window.clearTimeout(timer);
  }, [text]);
  const node = text ? (
    <p className="dtoast" role="status">
      {text}
    </p>
  ) : null;
  return { show: setText, node };
}

/** 가운데 창. Esc·바깥 누르면 닫는다. */
export function DeskModal({
  open,
  onClose,
  label,
  drawer = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  /** 오른쪽에서 나오는 서랍(담당 연결). */
  drawer?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="dim" onClick={onClose} aria-hidden="true" />
      <section
        className={drawer ? "drawer" : "dmodal"}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </section>
    </>
  );
}

/** "오늘 14:32" / "10월 26일 14:32" */
export function receivedLabel(iso: string | null, today: string) {
  if (!iso) return "";
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  const date = kstDateOf(iso);
  if (date === today) return `오늘 ${time}`;
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일 ${time}`;
}
