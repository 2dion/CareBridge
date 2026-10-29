"use client";

// W5 · AI 사용 원칙. AGENTS.md '바꾸지 않는 원칙' 1·2를 작성자 말로 옮김.
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { AppBar, MobileScreen } from "@/components/mobile/shell";

const steps = [
  {
    ko: "AI가 초안을 정리해요",
    vi: "AI sắp xếp bản nháp.",
    body: "말한 내용을 항목별로 정리해요. 말하지 않은 것은 지어내지 않아요.",
    bodyVi: "Sắp xếp theo mục. Không tự thêm điều chưa nói.",
  },
  {
    ko: "작성자가 확인해요",
    vi: "Người ghi chép kiểm tra.",
    body: "틀린 것은 고치고 빠진 것은 채워요.",
    bodyVi: "Sửa chỗ sai và bổ sung chỗ thiếu.",
  },
  {
    ko: "관리자가 승인해요",
    vi: "Người quản lý phê duyệt.",
    body: "관리자가 확인하고 승인해야 기록이 끝나요.",
    bodyVi: "Bản ghi hoàn tất khi người quản lý duyệt.",
  },
];

export default function AiPrinciplesPage() {
  return (
    <MobileScreen tab="me">
      <AppBar title="AI 사용 원칙" vi="Nguyên tắc sử dụng AI" back="/me" />
      <div className="scroll" style={{ marginTop: 8, paddingBottom: 16 }}>
        <section
          className="card"
          style={{ display: "flex", gap: 12, padding: 16, alignItems: "center" }}
        >
          <Art name="robot-face" width={64} className="art" />
          <div>
            <b style={{ fontSize: 17 }}>AI는 돌봄 기록을 도와요.</b>
            <span className="vi" style={{ display: "block", fontSize: 12 }}>
              AI hỗ trợ ghi chép chăm sóc.
            </span>
            <p style={{ fontSize: 14, marginTop: 4 }}>AI 결과는 초안이에요. 직접 확인해 주세요.</p>
            <span className="vi" style={{ fontSize: 12 }}>
              Kết quả AI là bản nháp. Hãy tự kiểm tra.
            </span>
          </div>
        </section>
        <h2 className="section-title">기록은 이렇게 완성돼요</h2>
        {steps.map((step, index) => (
          <article key={step.ko} className="view-item card">
            <span className="icon-bubble" style={{ fontWeight: 700 }}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="body">
              <b>{step.ko}</b>
              <span className="vi">{step.vi}</span>
              <p>{step.body}</p>
              <span className="vi">{step.bodyVi}</span>
            </div>
          </article>
        ))}
        <div
          className="reason-box big"
          style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        >
          <Icon name="alert" />
          <div>
            <b>건강·안전 문제는 관리자에게 먼저 알려 주세요.</b>
            <span className="vi" style={{ display: "block" }}>
              Hãy báo người quản lý trước khi có vấn đề sức khỏe hoặc an toàn.
            </span>
          </div>
        </div>
      </div>
    </MobileScreen>
  );
}
