"use client";

// W1(오늘): 오늘 기록이 있어야 하는 어르신 카드. 수정 필요·작성 전 알림은 머리(짙은 초록) 안 날짜 아래(이슈 #149).
// 병기(10/26): 카드 버튼·머리 알림은 병기, 날짜·배지·탭은 한국어만. 카드 안내 줄은 뺐다(10/29, 배지·버튼과 뜻이 겹침).
// 종 버튼은 두지 않는다(10/28 알림표시 결정): 수정 필요 알림과 하는 일이 같다.
import Link from "next/link";

import { ResidentPhoto } from "@/components/resident-photo";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { Loading, MobileScreen, StatusBadge } from "@/components/mobile/shell";
import {
  type DemoRecord,
  listMissed,
  monthDayWeek,
  type Resident,
  returnedRecords,
  timeRangeLabel,
  todayCards,
} from "@/lib/demo/store";

type CardAction = { ko: string; vi: string; href: string; primary: boolean };

/** 머리 알림 한 칸. 이름은 용어집 v1.0 상태 이름, 건수는 W4 탭 숫자와 같은 값 */
type HeaderAlert = {
  key: "returned" | "missed";
  ko: string;
  vi: string;
  count: number;
  href: string;
};

function cardAction(resident: Resident, today: string, record?: DemoRecord): CardAction {
  const start = `/start/${resident.id}?date=${today}`;
  if (!record || record.draftState === "empty") {
    return { ko: "기록 시작하기", vi: "Bắt đầu ghi chép", href: start, primary: true };
  }
  switch (record.status) {
    case "draft":
      return {
        ko: "이어 쓰기",
        vi: "Viết tiếp",
        href: record.draftState === "ready" ? `/records/${record.id}` : start,
        primary: true,
      };
    case "returned":
      return { ko: "고쳐 쓰기", vi: "Sửa bản ghi", href: `/records/${record.id}`, primary: true };
    default:
      return {
        ko: "기록 보기",
        vi: "Xem bản ghi",
        href: `/records/${record.id}/view`,
        primary: false,
      };
  }
}

export default function TodayPage() {
  const demo = useDemo();
  // 교육용 기관이면 문의 상대가 '강사'(이슈 #146)
  const names = useRoleNames();
  if (!demo) return <Loading tab="today" />;
  const { db, today } = demo;
  const cards = todayCards(db, today);
  const returned = returnedRecords(db);
  const missed = listMissed(db, today);
  // 0건인 알림은 뺀다. 둘 다 0건이면 알림 자리만 비고 머리 높이는 그대로(CSS 고정 높이)
  const allAlerts: HeaderAlert[] = [
    {
      key: "returned",
      ko: "수정 필요",
      vi: "Cần sửa",
      count: returned.length,
      href: "/archive?tab=returned",
    },
    {
      key: "missed",
      ko: "작성 전",
      vi: "Chưa ghi",
      count: missed.length,
      href: "/archive?tab=missed",
    },
  ];
  const alerts = allAlerts.filter((alert) => alert.count > 0);

  return (
    <MobileScreen tab="today">
      <header className="home-header">
        <div className="home-brand">
          <Art name="logo" width={150} alt="케어브릿지" className="home-logo" priority />
        </div>
        <div className="date">
          <strong>{monthDayWeek(today)}</strong>
        </div>
        {alerts.length > 0 && (
          <nav className="home-alerts" aria-label="할 일 알림">
            {alerts.map((alert) => (
              <Link key={alert.key} className={`home-alert ${alert.key}`} href={alert.href}>
                <span className="dot" />
                <span className="txt">
                  <strong>{alert.ko}</strong>
                  <span className="vi">{alert.vi}</span>
                </span>
                <b className="count">{alert.count}</b>
                <Icon name="next" />
              </Link>
            ))}
          </nav>
        )}
        <Art name="robot-home-header" width={132} className="art" priority />
      </header>
      <div className="home-body">
        {cards.length > 0 && (
          <h2 className="section-title">
            기록 시작할 어르신 <span>{cards.length}명</span>
          </h2>
        )}
        {cards.map(({ resident, record }) => {
          const action = cardAction(resident, today, record);
          const status = !record || record.draftState === "empty" ? "not_started" : record.status;
          return (
            <article key={resident.id} className="resident card">
              <div className="row">
                <ResidentPhoto resident={resident} size={56} />
                <div className="info">
                  <div className="name-row">
                    <span className="name">{resident.name}</span>
                    <StatusBadge status={status} />
                  </div>
                  <span style={{ fontSize: 13, color: "var(--color-sub)" }}>
                    {resident.careType === "home" ? "재가 · 방문 시간" : "시설 · 돌봄 시간"}{" "}
                    {timeRangeLabel(resident.visitTime)}
                  </span>
                </div>
              </div>
              <hr />
              <Link
                className={`btn ${action.primary ? "btn-primary" : "btn-outline"} btn-sm`}
                href={action.href}
              >
                <span className="spacer" />
                <span className="label two">
                  <b>{action.ko}</b>
                  <small>{action.vi}</small>
                </span>
                <Icon name="next" />
              </Link>
            </article>
          );
        })}
      </div>
      {cards.length === 0 && (
        <div
          className="grow stack"
          style={{ justifyContent: "center", gap: 14, padding: "20px 0" }}
        >
          <Art name="robot-rest" width={280} />
          <div className="empty">
            <strong>오늘 담당 어르신이 없습니다.</strong>
            <p style={{ marginTop: 6 }}>{names.reviewer}에게 문의하세요.</p>
            <span className="vi">
              Hôm nay bạn chưa có người cao tuổi được phân công chăm sóc. Vui lòng hỏi{" "}
              {names.reviewerVi}.
            </span>
          </div>
          <div className="pad">
            <Link className="btn btn-primary" href="/archive">
              <span className="spacer" />
              <span className="label">기록 보기</span>
              <Icon name="next" />
            </Link>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}
