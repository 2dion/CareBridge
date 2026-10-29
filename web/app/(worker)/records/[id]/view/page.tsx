"use client";

// W4 · 기록 보기(전송 완료·승인 완료). 읽기만 한다.
import Link from "next/link";
import { useParams } from "next/navigation";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { Icon, type IconName } from "@/components/mobile/icon";
import { Listen } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen, ResidentPill } from "@/components/mobile/shell";
import type { ItemKey } from "@/lib/demo/state";
import { displayOrder, getResident, itemLabel, kstTime, lateDays } from "@/lib/demo/store";

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
  const items = [...record.items].sort(
    (a, b) => displayOrder.indexOf(a.item_key) - displayOrder.indexOf(b.item_key),
  );
  const late = lateDays(record);

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
              ? `${names.reviewerVi} đã phê duyệt bản ghi.`
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
        {items.map((item) => {
          const label = itemLabel(item.item_key);
          const empty = item.status === "not_mentioned" && !item.value_ko;
          return (
            <article key={item.item_key} className="view-item card">
              <span className="icon-bubble">
                <Icon name={itemIcon[item.item_key]} />
              </span>
              <div className="body">
                <b>
                  {label.ko}
                  {item.status === "needs_check" && (
                    <span className="badge badge-orange" style={{ marginLeft: 6 }}>
                      확인 필요
                    </span>
                  )}
                </b>
                {empty ? (
                  <p style={{ color: "var(--color-muted)" }}>언급 없음</p>
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
        })}
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
