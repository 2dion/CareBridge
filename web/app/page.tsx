"use client";

// 시작 화면. Mock 모드는 로그인 대신 작성자·관리자를 고르는 시연 입구(화면 v1.3 '개발 환경': 전환 버튼은 Mock에서만).
// 실제 모드(Supabase 설정 있음)는 로고만 그리고 로그인한 역할 화면으로 보낸다. 모드는 빌드 때 정해지는 값(supabaseConfigured)이라
// 서버·첫 화면이 같아, Mock 버튼·문구가 잠깐이라도 보이지 않는다(이슈 #97).
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Icon } from "@/components/mobile/icon";
import { MobileScreen } from "@/components/mobile/shell";
import { supabaseConfigured } from "@/lib/auth/session";

const MOCK = !supabaseConfigured();

export default function Home() {
  const demo = useDemo();
  const router = useRouter();
  const workerHref = demo?.db.onboarded ? "/today" : "/guide";
  // 실제 모드: 로그인한 사람의 역할 화면으로 바로 간다(역할은 가입 코드가 정함). 로그인 전이면 공급자가 /login으로 보낸다
  const realRole = demo?.real?.role;
  useEffect(() => {
    if (realRole) router.replace(realRole === "reviewer" ? "/review" : workerHref);
  }, [realRole, workerHref, router]);
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
        {MOCK ? (
          <>
            <div className="stack pad" style={{ gap: 12 }}>
              <Link className="btn btn-primary" href={workerHref}>
                <span className="spacer" />
                <span className="label">작성자로 시작</span>
                <Icon name="next" />
              </Link>
              <Link className="btn btn-outline" href="/review">
                <span className="spacer" />
                <span className="label">관리자로 시작</span>
                <Icon name="next" />
              </Link>
              <Link className="text-link" href="/login">
                로그인 화면으로 들어가기
              </Link>
              {/* 시연 초기화는 Mock(브라우저 저장)에만 있다. 실제 데이터는 지우지 않는다 */}
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
          </>
        ) : (
          <p className="sr-only" role="status">
            불러오는 중
          </p>
        )}
      </div>
    </MobileScreen>
  );
}
