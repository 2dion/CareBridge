"use client";

// 작성자 화면 공통 틀: 화면 바탕, 위 제목줄, 아래 탭, 어르신 이름표.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { SHOW_FRAME_VI } from "@/lib/bilingual";
import { monthDay, type Resident } from "@/lib/demo/store";
import type { RecordStatus } from "@/lib/demo/state";

import { Icon, type IconName } from "./icon";

export type TabKey = "today" | "archive" | "helper" | "me";

const tabs: { key: TabKey; href: string; label: string; icon: IconName }[] = [
  { key: "today", href: "/today", label: "오늘", icon: "home" },
  { key: "archive", href: "/archive", label: "기록함", icon: "list" },
  { key: "helper", href: "/helper", label: "도우미", icon: "helper" },
  { key: "me", href: "/me", label: "내 정보", icon: "user" },
];

export function MobileScreen({
  tab,
  className = "",
  children,
}: {
  /** 하단 탭을 보일 때 고른 탭. 없으면 탭을 숨긴다(사용 안내·로그인). */
  tab?: TabKey | null;
  className?: string;
  children: ReactNode;
}) {
  const demo = useDemo();
  const font = demo?.db.fontSize ?? "normal";
  return (
    <main
      className={`m-app ${tab !== undefined ? "has-tabs" : ""} ${font !== "normal" ? `font-${font}` : ""} ${className}`}
    >
      {children}
      {tab !== undefined && <TabBar active={tab} />}
    </main>
  );
}

export function TabBar({ active }: { active: TabKey | null }) {
  return (
    <nav className="tab-bar" aria-label="아래 메뉴">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`tab ${tab.key === active ? "active" : ""}`}
          aria-current={tab.key === active ? "page" : undefined}
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** 화면 틀의 베트남어(제목·일반 버튼). 병기 원칙이면 숨긴다. */
export function FrameVi({
  children,
  className = "vi",
}: {
  children: ReactNode;
  className?: string;
}) {
  if (!SHOW_FRAME_VI) return null;
  return <span className={className}>{children}</span>;
}

export function AppBar({
  title,
  vi,
  viAlways,
  back,
  right,
}: {
  title: string;
  vi?: string;
  /** 병기 원칙 예외 화면(W0·A1·A2)이면 베트남어를 늘 보인다. */
  viAlways?: boolean;
  /** 링크 주소, 함수, 또는 true면 브라우저 뒤로 */
  back?: string | true | (() => void);
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="app-bar">
      <div className="side">
        {back === true || typeof back === "function" ? (
          <button
            type="button"
            onClick={() => (back === true ? router.back() : back())}
            aria-label="뒤로"
          >
            <Icon name="back" />
          </button>
        ) : back ? (
          <Link href={back} aria-label="뒤로">
            <Icon name="back" />
          </Link>
        ) : null}
      </div>
      <div className="title">
        <strong>{title}</strong>
        {vi && (viAlways ? <span className="vi">{vi}</span> : <FrameVi>{vi}</FrameVi>)}
      </div>
      <div className="side side-right">{right}</div>
    </header>
  );
}

export function ResidentPill({
  resident,
  date,
  extra,
}: {
  resident: Resident;
  date: string;
  extra?: string;
}) {
  return (
    <div className="resident-pill">
      <span className="mini-avatar">{resident.initial}</span>
      <span>
        <b>{resident.alias}</b> · {monthDay(date)}
        {extra ? ` · ${extra}` : ""}
      </span>
    </div>
  );
}

/** 기록 상태 배지(화면 틀이라 한국어만). 값은 records.status, 이름은 2026-10-27-상태이름 결정. */
export const recordStatusBadge: Record<
  RecordStatus | "not_started",
  { label: string; tone: "gray" | "green" | "orange" | "blue"; icon?: IconName }
> = {
  not_started: { label: "작성 전", tone: "gray" },
  draft: { label: "임시 저장", tone: "blue" },
  submitted: { label: "전송 완료", tone: "green" },
  returned: { label: "수정 필요", tone: "orange" },
  approved: { label: "승인 완료", tone: "green", icon: "check" },
};

export function StatusBadge({ status }: { status: RecordStatus | "not_started" }) {
  const badge = recordStatusBadge[status];
  return (
    <span className={`badge badge-${badge.tone}`}>
      {badge.icon && <Icon name={badge.icon} />}
      {badge.label}
    </span>
  );
}

/** 데이터를 읽는 동안 보이는 빈 화면(깜빡임 줄이기). */
export function Loading({ tab }: { tab?: TabKey | null }) {
  return (
    <MobileScreen tab={tab}>
      <p className="sr-only" role="status">
        불러오는 중
      </p>
    </MobileScreen>
  );
}
