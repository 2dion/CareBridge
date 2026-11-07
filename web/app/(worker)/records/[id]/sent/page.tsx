"use client";

import { Native, useNativeLanguage } from "@/components/mobile/native";

import { nativeMessage } from "@/lib/i18n/messages";

// W3 · 전송 완료.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen } from "@/components/mobile/shell";
import { getResident, lateDays, monthDay } from "@/lib/demo/store";
import { readSentReceipt, type SentReceipt } from "@/lib/records/sent-receipt";

export default function SentPage() {
  const nativeLanguage = useNativeLanguage();
  const { id } = useParams<{ id: string }>();
  const demo = useDemo();
  const names = useRoleNames();
  const router = useRouter();
  const record = demo?.db.records[id];
  const resident = demo && record ? getResident(demo.db, record.residentId) : undefined;
  // 읽기가 끝났는데 기록이 없으면(담당이 끝난 어르신의 기록을 전송해 권한에서 빠짐, #367·#374)
  // 이 탭에 남긴 날짜 영수증으로 완료를 알린다. 영수증도 없으면 오늘 화면으로 보낸다.
  const missing = Boolean(demo) && !record;
  // 영수증은 전송 직후 이동 전에 남으므로 처음 그릴 때 한 번 읽는다(서버에서는 window가 없어 null)
  const [receipt] = useState<SentReceipt | null>(() => readSentReceipt(id));
  useEffect(() => {
    if (missing && !receipt) router.replace("/today");
  }, [missing, receipt, router]);

  if (!demo) return <Loading tab="today" />;
  const careDate = record ? record.careDate : receipt?.careDate;
  if (!careDate || (record && !resident)) return <Loading tab="today" />;
  const late = record
    ? lateDays(record)
    : lateDays({ careDate, firstSubmittedAt: receipt?.firstSubmittedAt ?? null });

  return (
    <MobileScreen tab="today">
      <AppBar title="전송 완료" native={nativeMessage(nativeLanguage, "w3.sent.title")} />
      <div className="stack" style={{ alignItems: "center", marginTop: 48 }}>
        <div className="burst">
          <span className="icon-bubble solid">
            <Icon name="check" />
          </span>
        </div>
        <h1 className="headline" style={{ fontSize: 26, marginTop: 22 }}>
          기록을 전송했어요!
        </h1>
      </div>
      <section className="card" style={{ margin: "28px 16px 0", padding: "18px 20px" }}>
        <b style={{ fontSize: 17 }}>
          {resident ? `${resident.name} · ${monthDay(careDate)}` : monthDay(careDate)}
        </b>
        <p style={{ marginTop: 8, fontSize: 15, color: "var(--color-sub)" }}>
          확인한 기록을 {names.reviewer}에게 전송했어요. {names.reviewer}가 승인하면 끝나요.
        </p>
        <Native className="native" style={{ fontSize: 14 }} requiredIds={["w3.sent.description"]}>
          {nativeMessage(nativeLanguage, "w3.sent.description", {
            reviewer: names.reviewerNative,
          })}
        </Native>
        {late !== null && late > 0 && (
          <p style={{ marginTop: 8, fontSize: 13, color: "var(--color-warn-text)" }}>
            돌봄 날짜보다 {late}일 늦게 전송해서 ‘지연전송’으로 표시돼요.
            <Native
              className="native"
              style={{ display: "block" }}
              requiredIds={["w3.sent.latePrefix", "w3.sent.lateSuffix"]}
            >
              {nativeMessage(nativeLanguage, "w3.sent.latePrefix")}
              {late} {nativeMessage(nativeLanguage, "w3.sent.lateSuffix")}
            </Native>
          </p>
        )}
      </section>
      <div className="stack pad" style={{ gap: 12, marginTop: 32 }}>
        <Link className="btn btn-primary" href="/today">
          <BtnLabel ko="오늘 화면으로" native={nativeMessage(nativeLanguage, "w3.sent.today")} />
        </Link>
        {record && (
          <Link className="btn btn-outline" href="/archive?tab=submitted">
            <BtnLabel
              ko="기록에서 보기"
              native={nativeMessage(nativeLanguage, "w3.sent.archive")}
            />
          </Link>
        )}
      </div>
    </MobileScreen>
  );
}
