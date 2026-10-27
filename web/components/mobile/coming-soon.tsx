"use client";

// 아직 만들지 않은 탭 화면 자리(다음 PR에서 채운다).
import Link from "next/link";

import { Art } from "./art";
import { AppBar, MobileScreen, type TabKey } from "./shell";

export function ComingSoon({ tab, title }: { tab: TabKey; title: string }) {
  return (
    <MobileScreen tab={tab}>
      <AppBar title={title} />
      <div className="grow stack" style={{ justifyContent: "center", gap: 14 }}>
        <Art name="robot-rest" width={260} />
        <div className="empty">
          <strong>{title} 화면을 준비하고 있어요.</strong>
          <p style={{ marginTop: 6 }}>지금은 오늘 화면에서 기록을 써 주세요.</p>
        </div>
        <div className="pad">
          <Link className="btn btn-primary" href="/today">
            <span className="label">오늘 화면으로</span>
          </Link>
        </div>
      </div>
    </MobileScreen>
  );
}
