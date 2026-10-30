"use client";

// W4 · 기록 보기(전송 완료·승인 완료). 읽기만 한다.
import Link from "next/link";
import { useParams } from "next/navigation";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { Icon, type IconName } from "@/components/mobile/icon";
import { Listen } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen, ResidentPill } from "@/components/mobile/shell";
import type { ItemKey } from "@/lib/demo/state";
import { type RecordItem, getResident, itemLabel, kstTime, lateDays } from "@/lib/demo/store";
import { recordViewItems } from "@/lib/records/view-order";
import { capitalizeVi, itemBadge, withNote } from "@/lib/records/item-badge";

const badgeClass = { orange: "badge-orange", green: "badge-green", gray: "badge-gray" } as const;

const itemIcon: Record<ItemKey, IconName> = {
  visit_time: "calendar",
  support: "users",
  meal: "meal",
  sleep: "moon",
  discomfort: "alert",
  cognition: "bulb",
  medication: "pill",
  notes: "doc",
  next_check: "check",
};

export default function RecordViewPage() {
  const { id } = useParams<{ id: string }>();
  const demo = useDemo();
  const names = useRoleNames();
  const record = demo?.db.records[id];
  const resident = demo && record ? getResident(demo.db, record.residentId) : undefined;
  if (!demo || !record || !resident) return <Loading tab="archive" />;

  if (record.status === "draft" || record.status === "returned") {
    return (
      <MobileScreen tab="archive">
        <AppBar title="기록 보기" back={true} />
        <ResidentPill resident={resident} date={record.careDate} />
        <div className="pad" style={{ marginTop: 24 }}>
          <Link className="btn btn-primary" href={`/records/${id}`}>
            <span className="label">
              {record.status === "returned" ? "고쳐 쓰기" : "이어 쓰기"}
            </span>
          </Link>
        </div>
      </MobileScreen>
    );
  }

  const approved = record.status === "approved";
  const sections = recordViewItems(record.items, approved);
  const late = lateDays(record);
  const renderItem = (item: RecordItem) => {
    const label = itemLabel(item.item_key);
    // '확인 필요'에 관리자가 고른 결과([확인함]/[기록 안 함])가 있으면 그 배지를 보인다(이슈 #98)
    const badge = itemBadge(item, names);
    const omitted = badge?.kind === "omitted";
    const empty = !item.value_ko && (item.status === "not_mentioned" || omitted);
    return (
      <article key={item.item_key} className="view-item card">
        <span className="icon-bubble">
          <Icon name={itemIcon[item.item_key]} />
        </span>
        <div className="body">
          <b>
            {label.ko}
            {badge && (
              <span className={`badge ${badgeClass[badge.tone]}`} style={{ marginLeft: 6 }}>
                {badge.ko}
              </span>
            )}
          </b>
          {badge?.vi && (
            <span className="vi" style={{ display: "block" }}>
              {badge.vi}
            </span>
          )}
          {empty ? (
            <p style={{ color: "var(--color-muted)" }}>
              {omitted ? withNote("기록 안 함", item.resolution_note) : "언급 없음"}
            </p>
          ) : (
            <>
              <div className="ko-line">
                <p>{item.value_ko}</p>
                <Listen text={item.value_ko} />
              </div>
              {item.value_native && <span className="vi">{item.value_native}</span>}
            </>
          )}
        </div>
      </article>
    );
  };

  return (
    <MobileScreen tab="archive">
      <AppBar title="기록 보기" vi="Xem bản ghi" back={true} />
      <ResidentPill resident={resident} date={record.careDate} />
      <section className="state-card card">
        <span className="check-dot solid">
          <Icon name="check" />
        </span>
        <div>
          <b>{approved ? "승인 완료" : "전송 완료"}</b>
          <p>
            {approved
              ? `${names.reviewer}가 검토하고 승인했어요.`
              : `${names.reviewer} 확인을 기다리고 있어요.`}
          </p>
          <span className="vi">
            {approved
              ? `${capitalizeVi(names.reviewerVi)} đã phê duyệt bản ghi.`
              : `Đang chờ ${names.reviewerVi} xem xét.`}
          </span>
        </div>
      </section>
      <div className="content-head">
        기록 내용
        <small>
          {approved ? `${kstTime(record.approvedAt)} 승인` : `${kstTime(record.submittedAt)} 전송`}
          {late ? ` · 지연전송 ${late}일` : ""}
        </small>
      </div>
      <div className="scroll" style={{ paddingBottom: 16 }}>
        {sections.visible.map(renderItem)}
        {sections.missing.length > 0 && (
          <details className="card" style={{ padding: 14 }}>
            <summary>
              언급 없음 항목 {sections.missing.length}개{" "}
              <span className="vi">Các mục không được đề cập</span>
            </summary>
            {sections.missing.map(renderItem)}
          </details>
        )}
        {!approved && (
          <p className="foot-note">
            {names.reviewer} 검토가 끝나면 기록 상태가 바뀌어요.
            <span className="vi">Trạng thái sẽ thay đổi sau khi được xem xét.</span>
          </p>
        )}
      </div>
    </MobileScreen>
  );
}
