"use client";

// W5 · 개인정보 안내. 읽고 판단하는 안내라 병기.
import { useRoleNames } from "@/components/demo/demo-provider";
import { Icon, type IconName } from "@/components/mobile/icon";
import { AppBar, MobileScreen } from "@/components/mobile/shell";
import { PRIVACY_SECTIONS } from "@/lib/privacy";
import type { RoleNames } from "@/lib/demo/roles";

// 교육용 기관이면 문의 상대가 '강사'(이슈 #146)
const buildSections = (
  names: RoleNames,
): { icon: IconName; ko: string; vi: string; body: string; bodyVi: string }[] => [
  ...PRIVACY_SECTIONS,
  {
    icon: "headset",
    ko: "문의",
    vi: "Liên hệ",
    body: `궁금한 점은 ${names.reviewer}에게 직접 묻거나 기관 대표번호로 연락하세요.`,
    bodyVi: `Hãy hỏi trực tiếp ${names.reviewerVi} hoặc gọi số điện thoại chính của cơ sở.`,
  },
];

export default function PrivacyPage() {
  const sections = buildSections(useRoleNames());
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
