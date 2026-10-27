"use client";

// W1(오늘): 오늘 기록이 있어야 하는 어르신 카드, 되돌아옴·못 쓴 기록 띠.
// 병기(10/26): 카드 버튼·띠·카드 안내 줄은 병기, 날짜·배지·탭은 한국어만.
import Link from "next/link";

import { useDemo } from "@/components/demo/demo-provider";
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

function cardGuide(resident: Resident, record?: DemoRecord): { ko: string; vi: string } {
  if (!record || record.draftState === "empty") {
    return resident.careType === "home"
      ? { ko: "오늘 방문 예정", vi: "Hôm nay có lịch thăm." }
      : { ko: "오늘 기록을 써 주세요", vi: "Hãy ghi chép cho hôm nay." };
  }
  switch (record.status) {
    case "draft":
      return { ko: "쓰던 기록이 있어요", vi: "Có bản ghi đang viết dở." };
    case "submitted":
      return { ko: "담당자가 확인하고 있어요", vi: "Người phụ trách đang xem." };
    case "returned":
      return { ko: "담당자가 돌려보냈어요", vi: "Người phụ trách đã trả lại." };
    case "approved":
      return { ko: "오늘 기록을 확인할 수 있어요.", vi: "Bản ghi hôm nay đã được duyệt." };
  }
}

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
  if (!demo) return <Loading tab="today" />;
  const { db, today } = demo;
  const cards = todayCards(db, today);
  const returned = returnedRecords(db);
  const missed = listMissed(db, today);

  return (
    <MobileScreen tab="today">
      <header className="home-header">
        <Link className="bell" href="/archive?tab=returned" aria-label="알림">
          <Icon name="bell" />
        </Link>
        <div className="date">
          <strong>{monthDayWeek(today)}</strong>
        </div>
        <Art name="robot-home-header" width={132} className="art" priority />
      </header>
      <div className="home-body">
        {returned.length > 0 && (
          <Link className="returned" href="/archive?tab=returned">
            <span className="dot" />
            <div className="txt">
              <strong>되돌아온 기록 {returned.length}건</strong>
              <span className="vi">Có {returned.length} bản ghi cần sửa.</span>
            </div>
            <Icon name="next" />
          </Link>
        )}
        {missed.length > 0 && (
          <Link className="returned missed" href="/archive?tab=missed">
            <span className="dot" />
            <div className="txt">
              <strong>지난 기록 {missed.length}건을 아직 못 썼어요</strong>
              <span className="vi">Còn {missed.length} bản ghi trước chưa viết.</span>
            </div>
            <Icon name="next" />
          </Link>
        )}
        {cards.length > 0 && (
          <>
            <h2 className="section-title">
              기록 시작할 어르신 <span>{cards.length}명</span>
            </h2>
            <p style={{ marginTop: -8, fontSize: 14, color: "var(--color-sub)" }}>
              카드를 눌러 기록을 시작하세요.
              <span className="vi" style={{ display: "block", fontSize: 12 }}>
                Nhấn vào thẻ để bắt đầu ghi chép.
              </span>
            </p>
          </>
        )}
        {cards.map(({ resident, record }) => {
          const guide = cardGuide(resident, record);
          const action = cardAction(resident, today, record);
          const status = !record || record.draftState === "empty" ? "not_started" : record.status;
          return (
            <article key={resident.id} className="resident card">
              <div className="row">
                <div className="avatar">{resident.initial}</div>
                <div className="info">
                  <div className="name-row">
                    <span className="name">{resident.alias}</span>
                    <StatusBadge status={status} />
                  </div>
                  <span style={{ fontSize: 13, color: "var(--color-sub)" }}>
                    {resident.careType === "home" ? "재가 · 방문 시간" : "시설 · 돌봄 시간"}{" "}
                    {timeRangeLabel(resident.visitTime)}
                  </span>
                  <div className="line">
                    <Icon name="calendar" />
                    <span>{guide.ko}</span>
                  </div>
                  <span className="line-vi vi">{guide.vi}</span>
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
            <p style={{ marginTop: 6 }}>담당자에게 문의하세요.</p>
            <span className="vi">
              Hôm nay bạn chưa có người cao tuổi được phân công chăm sóc. Vui lòng hỏi nhân viên phụ
              trách.
            </span>
          </div>
          <div className="pad">
            <Link className="btn btn-primary" href="/archive">
              <span className="spacer" />
              <span className="label">기록함 보기</span>
              <Icon name="next" />
            </Link>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}
