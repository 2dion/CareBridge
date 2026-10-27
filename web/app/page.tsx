"use client";

// Mock 시연 입구. 로그인 대신 작성자·담당자를 고른다(화면 v1.3 '개발 환경': Mock에서는 전환 버튼을 그대로 씀).
import Image from "next/image";
import Link from "next/link";

import { useDemo } from "@/components/demo/demo-provider";
import { Icon } from "@/components/mobile/icon";
import { MobileScreen } from "@/components/mobile/shell";

export default function Home() {
  const demo = useDemo();
  const workerHref = demo?.db.onboarded ? "/today" : "/guide";
  return (
    <MobileScreen>
      <div className="grow stack" style={{ justifyContent: "center", gap: 28, padding: "40px 0" }}>
        <div className="center">
          <Image
            className="art"
            src="/art/logo.png"
            alt="CareBridge"
            width={150}
            height={116}
            priority
          />
          <p style={{ marginTop: 10, fontSize: 16, color: "var(--color-sub)" }}>
            말로 남기고, 확인만 하면 되는 돌봄 기록
          </p>
          <p className="vi" style={{ fontSize: 13 }}>
            Ghi chép chăm sóc bằng giọng nói
          </p>
        </div>
        <div className="stack pad" style={{ gap: 12 }}>
          <Link className="btn btn-primary" href={workerHref}>
            <span className="spacer" />
            <span className="label">작성자로 시작</span>
            <Icon name="next" />
          </Link>
          <Link className="btn btn-outline" href="/review">
            <span className="spacer" />
            <span className="label">담당자로 시작</span>
            <Icon name="next" />
          </Link>
          <Link className="text-link" href="/login">
            로그인 화면으로 들어가기
          </Link>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              if (window.confirm("시연 데이터를 처음 상태로 되돌릴까요?")) demo?.reset();
            }}
          >
            시연 초기화
          </button>
        </div>
        <p
          className="center"
          style={{ fontSize: 12, color: "var(--color-muted)", padding: "0 24px" }}
        >
          Mock 시연입니다. 기록은 이 브라우저에만 저장되고, 어르신은 모두 합성 사례입니다.
        </p>
      </div>
    </MobileScreen>
  );
}
