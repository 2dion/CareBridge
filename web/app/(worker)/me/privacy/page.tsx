"use client";

// W5 · 개인정보 안내. 읽고 판단하는 안내라 병기.
import { Icon, type IconName } from "@/components/mobile/icon";
import { AppBar, MobileScreen } from "@/components/mobile/shell";

const sections: { icon: IconName; ko: string; vi: string; body: string; bodyVi: string }[] = [
  {
    icon: "user",
    ko: "모으는 정보",
    vi: "Thông tin thu thập",
    body: "이름, 언어 설정, 기록 내용만 모아요. 어르신·가족 실명은 쓰지 않아요.",
    bodyVi: "Chỉ tên, ngôn ngữ và nội dung ghi chép. Không dùng tên thật của người cao tuổi.",
  },
  {
    icon: "doc",
    ko: "쓰는 곳",
    vi: "Mục đích sử dụng",
    body: "돌봄 기록 초안 만들기와 번역에만 써요. 녹음은 글자로 바꾼 뒤 지워요.",
    bodyVi: "Chỉ dùng để soạn bản nháp và dịch. Bản ghi âm bị xóa sau khi chuyển thành chữ.",
  },
  {
    icon: "shield",
    ko: "보관과 보호",
    vi: "Lưu trữ và bảo vệ",
    body: "우리 기관 사람만 볼 수 있게 나눠서 보관해요.",
    bodyVi: "Chỉ người trong cơ sở của bạn mới xem được.",
  },
  {
    icon: "headset",
    ko: "문의",
    vi: "Liên hệ",
    body: "궁금한 점은 관리자에게 물어보세요.",
    bodyVi: "Hãy hỏi người quản lý nếu có thắc mắc.",
  },
];

export default function PrivacyPage() {
  return (
    <MobileScreen tab="me">
      <AppBar title="개인정보 안내" vi="Thông tin quyền riêng tư" back="/me" />
      <div className="scroll" style={{ marginTop: 8, paddingBottom: 16 }}>
        <section className="state-card card">
          <span className="check-dot">
            <Icon name="shield" />
          </span>
          <div>
            <b>필요한 최소한의 정보만 안전하게 써요.</b>
            <span className="vi">Chúng tôi chỉ dùng thông tin tối thiểu cần thiết.</span>
          </div>
        </section>
        {sections.map((section) => (
          <article key={section.ko} className="view-item card">
            <span className="icon-bubble">
              <Icon name={section.icon} />
            </span>
            <div className="body">
              <b>{section.ko}</b>
              <span className="vi">{section.vi}</span>
              <p>{section.body}</p>
              <span className="vi">{section.bodyVi}</span>
            </div>
          </article>
        ))}
      </div>
    </MobileScreen>
  );
}
