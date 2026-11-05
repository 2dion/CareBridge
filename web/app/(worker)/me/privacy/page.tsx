"use client";

import { Native, useNativeLanguage } from "@/components/mobile/native";

import { nativeMessage } from "@/lib/i18n/messages";

// W5 · 개인정보 안내. 읽고 판단하는 안내라 병기.
import { useRoleNames } from "@/components/demo/demo-provider";
import { Icon, type IconName } from "@/components/mobile/icon";
import { AppBar, MobileScreen } from "@/components/mobile/shell";
import { privacySections } from "@/lib/privacy";
import type { RoleNames } from "@/lib/demo/roles";

export default function PrivacyPage() {
  const nativeLanguage = useNativeLanguage();
  const buildSections = (
    names: RoleNames,
  ): { icon: IconName; ko: string; native: string; body: string; bodyNative: string }[] => [
    ...privacySections(nativeLanguage),
    {
      icon: "headset",
      ko: "문의",
      native: nativeMessage(nativeLanguage, "privacy.contact.title"),
      body: `궁금한 점은 ${names.reviewer}에게 직접 묻거나 기관 대표번호로 연락하세요.`,
      bodyNative: nativeMessage(nativeLanguage, "privacy.contact.description", {
        reviewer: names.reviewerNative,
      }),
    },
  ];

  const sections = buildSections(useRoleNames());
  return (
    <MobileScreen tab="me">
      <AppBar
        title="개인정보 안내"
        native={nativeMessage(nativeLanguage, "privacy.title")}
        back="/me"
      />
      <div className="scroll" style={{ marginTop: 8, paddingBottom: 16 }}>
        <section className="state-card card">
          <span className="check-dot">
            <Icon name="shield" />
          </span>
          <div>
            <b>필요한 최소한의 정보만 안전하게 써요.</b>
            <Native className="native">
              {nativeMessage(nativeLanguage, "privacy.description")}
            </Native>
          </div>
        </section>
        {sections.map((section) => (
          <article key={section.ko} className="view-item card">
            <span className="icon-bubble">
              <Icon name={section.icon} />
            </span>
            <div className="body">
              <b>{section.ko}</b>
              <Native className="native">{section.native}</Native>
              <p>{section.body}</p>
              <Native className="native">{section.bodyNative}</Native>
            </div>
          </article>
        ))}
      </div>
    </MobileScreen>
  );
}
