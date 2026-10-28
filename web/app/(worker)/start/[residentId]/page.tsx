"use client";

// 기록 시작(피그마 M05~M07): 음성으로 기록 / 글로 쓰기. 임시 저장이 있으면 그 방법 카드에 표시.
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { nowIso, useDemo } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { AppBar, Loading, MobileScreen, ResidentPill } from "@/components/mobile/shell";
import { type CreateError, ensureRecord, findRecord, getResident } from "@/lib/demo/store";

const createErrors: Record<CreateError, { ko: string; vi: string }> = {
  future: {
    ko: "앞으로 올 날의 기록은 쓸 수 없어요.",
    vi: "Không thể ghi cho ngày trong tương lai.",
  },
  too_old: {
    ko: "7일이 지나 이 날 기록은 쓸 수 없어요. 담당자에게 알려 주세요.",
    vi: "Đã quá 7 ngày nên không thể ghi. Hãy báo người phụ trách.",
  },
  no_care_day: {
    ko: "기록 없음으로 처리한 날이에요.",
    vi: "Ngày này đã được đánh dấu không có chăm sóc.",
  },
};

export default function StartPage() {
  const { residentId } = useParams<{ residentId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const demo = useDemo();
  const [error, setError] = useState<CreateError | null>(null);
  const [realError, setRealError] = useState("");
  if (!demo) return <Loading tab="today" />;
  const { db, today, update } = demo;
  const resident = getResident(db, residentId);
  const date = search.get("date") ?? today;
  if (!resident) {
    return (
      <MobileScreen tab="today">
        <AppBar title="기록 시작" back="/today" />
        <p className="empty" style={{ marginTop: 40 }}>
          어르신을 찾지 못했어요.
        </p>
      </MobileScreen>
    );
  }
  const existing = findRecord(db, resident.id, date);
  const draftReady = existing?.draftState === "ready" && existing.status === "draft";

  const go = (mode: "voice" | "text") => {
    if (existing && existing.status !== "draft") {
      router.push(
        existing.status === "returned" ? `/records/${existing.id}` : `/records/${existing.id}/view`,
      );
      return;
    }
    if (draftReady && existing.inputMode === mode) {
      router.push(`/records/${existing.id}`);
      return;
    }
    const result = ensureRecord(db, resident.id, date, today, nowIso());
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const next = mode === "voice" ? "voice" : "write";
    if (demo.real) {
      if (existing) {
        router.push(`/records/${existing.id}/${next}`);
        return;
      }
      // records에 바로 넣는다(작성자, 내 담당 어르신, draft). 날짜·기록 없음 처리는 DB도 다시 막는다
      void demo.real.actions.createRecord(resident.id, date).then((created) => {
        if (!created.ok) {
          setRealError(`${created.ko} ${created.vi}`);
          return;
        }
        router.push(`/records/${created.data.id}/${next}`);
      });
      return;
    }
    update(() => result.db);
    router.push(`/records/${result.id}/${next}`);
  };

  const draftBadge = (
    <span className="badge badge-green" style={{ marginTop: 6 }}>
      <Icon name="doc" />
      임시저장 1개
    </span>
  );

  return (
    <MobileScreen tab="today">
      <AppBar title="기록 시작" vi="Bắt đầu ghi chép" back={true} />
      <ResidentPill resident={resident} date={date} />
      {date !== today && (
        <p className="center" style={{ marginTop: 10, fontSize: 20, fontWeight: 700 }}>
          {Number(date.slice(5, 7))}월 {Number(date.slice(8, 10))}일 기록
        </p>
      )}
      <div className="grow stack" style={{ justifyContent: "center" }}>
        <Art name="robot-start" width={330} priority />
      </div>
      {error && (
        <div className="reason-box" role="alert" style={{ margin: "0 16px 12px" }}>
          <b>{createErrors[error].ko}</b>
          <span className="vi">{createErrors[error].vi}</span>
        </div>
      )}
      {realError && (
        <div className="reason-box" role="alert" style={{ margin: "0 16px 12px" }}>
          {realError}
        </div>
      )}
      <div className="stack pad" style={{ gap: 12, marginBottom: 14 }}>
        <button type="button" className="method card" onClick={() => go("voice")}>
          <div className="icon-bubble">
            <Icon name="mic" />
          </div>
          <div className="body">
            <strong>음성으로 기록</strong>
            <span className="m-vi vi">Ghi bằng giọng nói</span>
            <p>
              말하면서 빠르게
              <br />
              기록 초안을 만들어요.
            </p>
            <span className="p-vi vi">Tạo bản nháp nhanh bằng lời nói.</span>
            {draftReady && existing.inputMode === "voice" && draftBadge}
          </div>
          <Icon name="next" />
        </button>
        <button type="button" className="method card" onClick={() => go("text")}>
          <div className="icon-bubble">
            <Icon name="write" />
          </div>
          <div className="body">
            <strong>글로 쓰기</strong>
            <span className="m-vi vi">Viết trực tiếp</span>
            <p>
              직접 입력해서
              <br />
              기록할 수 있어요.
            </p>
            <span className="p-vi vi">Nhập trực tiếp để ghi chép.</span>
            {draftReady && existing.inputMode === "text" && draftBadge}
          </div>
          <Icon name="next" />
        </button>
      </div>
    </MobileScreen>
  );
}
