"use client";

// W2 · 글로 쓰기: 쓴 글로 초안을 만든다. 쓰는 화면이라 안내는 한국어만(병기 원칙 ①).
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { nowIso, useDemo } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen, ResidentPill } from "@/components/mobile/shell";
import { TextArea } from "@/components/mobile/text-field";
import { getResident, markProcessing } from "@/lib/demo/store";

const MIN_LENGTH = 5;

export default function WritePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const demo = useDemo();
  const [text, setText] = useState<string | null>(null);

  const record = demo?.db.records[id];
  const locked = record && record.status !== "draft" && record.status !== "returned";
  useEffect(() => {
    if (locked) router.replace(`/records/${id}/view`);
  }, [locked, id, router]);

  if (!demo || !record) return <Loading tab="today" />;
  const resident = getResident(demo.db, record.residentId);
  if (!resident) return <Loading tab="today" />;
  const value = text ?? (record.inputMode === "text" ? record.transcript : "");
  const ready = value.trim().length >= MIN_LENGTH;

  const make = () => {
    if (!ready) return;
    if (demo.real) {
      // 쓴 글을 원문으로 저장하고 Agent를 돌린다. W3는 끝날 때까지 '정리 중'을 보인다
      void demo.real.actions.writeText(id, value.trim());
      router.replace(`/records/${id}`);
      return;
    }
    demo.update((db) => markProcessing(db, id, value.trim(), nowIso()));
    router.replace(`/records/${id}`);
  };

  return (
    <MobileScreen tab="today">
      <AppBar title="글로 쓰기" vi="Viết trực tiếp" back={true} />
      <ResidentPill resident={resident} date={record.careDate} />
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "12px 0 0 24px",
        }}
      >
        <div style={{ paddingBottom: 16 }}>
          <p className="headline">
            글로 돌봄 내용을
            <br />
            <em>남겨 주세요.</em>
          </p>
        </div>
        <Art name="robot-writing" width={130} className="art flush" />
      </div>
      <section className="write-card card grow" style={{ marginTop: -6 }}>
        <div className="write-head">
          <span className="icon-bubble sm">
            <Icon name="pencil" />
          </span>
          <div>
            <b>돌봄 내용</b>
          </div>
        </div>
        <label className="sr-only" htmlFor="care-text">
          돌봄 내용
        </label>
        <TextArea
          id="care-text"
          value={value}
          onValueChange={setText}
          placeholder={"오늘 도운 일, 식사, 수면,\n달라진 점을 자유롭게\n적어 주세요."}
        />
        <div className="note-line">
          <Icon name="info" />
          <span>한국어 또는 베트남어로 작성할 수 있어요.</span>
        </div>
      </section>
      <div className="pad" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={make} disabled={!ready}>
          <BtnLabel ko="초안 만들기" vi="Tạo bản nháp" />
        </button>
      </div>
      <div style={{ height: 18 }} />
    </MobileScreen>
  );
}
