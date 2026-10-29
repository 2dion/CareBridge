"use client";

// 시작 화면. Mock 모드는 로그인 대신 작성자·관리자를 고르는 시연 입구(화면 v1.3 '개발 환경': 전환 버튼은 Mock에서만).
// 실제 모드(Supabase 설정 있음)는 A0(스플래시): 로고를 짧게(SPLASH_MS) 보인 뒤 자동으로 넘어간다(화면 v1.3 A0, 이슈 #111).
// 로그인한 사람은 역할 화면으로, 로그인 전이면 데이터 공급자가 같은 시간이 지난 뒤 A1(로그인)으로 보낸다. 누르면 바로 넘어간다.
// 모드는 빌드 때 정해지는 값(supabaseConfigured)이라 서버·첫 화면이 같아, Mock 버튼·문구가 잠깐이라도 보이지 않는다(이슈 #97).
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Icon } from "@/components/mobile/icon";
import { MobileScreen } from "@/components/mobile/shell";
import { supabaseConfigured } from "@/lib/auth/session";
import { splashRemaining } from "@/lib/auth/splash";

const MOCK = !supabaseConfigured();

export default function Home() {
  const demo = useDemo();
  const router = useRouter();
  const workerHref = demo?.db.onboarded ? "/today" : "/guide";
  // 실제 모드: 로그인한 사람의 역할 화면으로 간다(역할은 가입 코드가 정함). 스플래시 시간이 남았으면 그만큼 기다린다
  const realRole = demo?.real?.role;
  const roleHref = realRole === "reviewer" ? "/review" : workerHref;
  useEffect(() => {
    if (MOCK || !realRole) return;
    const timer = window.setTimeout(() => router.replace(roleHref), splashRemaining());
    return () => window.clearTimeout(timer);
  }, [realRole, roleHref, router]);
  // 스플래시를 누르면 기다리지 않고 바로 넘어간다. 아직 로그인 여부를 모르면 A1(로그인)으로 간다
  const skip = () => router.replace(realRole ? roleHref : "/login");

  return (
    <MobileScreen>
      <div
        className={`grow stack ${MOCK ? "" : "splash"}`}
        style={{ justifyContent: "center", gap: 28, padding: "40px 0" }}
        onClick={MOCK ? undefined : skip}
      >
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
          <>
            {/* 자동으로 넘어가지만, 키보드로도 건너뛸 수 있게 글자 버튼을 둔다. 누르면 바깥 onClick(skip)으로 올라간다 */}
            <button type="button" className="text-link splash-skip">
              눌러서 바로 가기
              <span className="vi">Chạm để tiếp tục</span>
            </button>
            <p className="sr-only" role="status">
              불러오는 중
            </p>
          </>
        )}
      </div>
    </MobileScreen>
  );
}
