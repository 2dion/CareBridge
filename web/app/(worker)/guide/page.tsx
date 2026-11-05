"use client";

import { Native, useNativeLanguage } from "@/components/mobile/native";

import { nativeMessage } from "@/lib/i18n/messages";

// W0(사용 안내): 처음 한 번 3장. 로그인 전·처음 보는 곳이라 병기(화면 v1.3 병기 원칙 ③ 예외).
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { Art, type ArtName } from "@/components/mobile/art";
import { Icon, type IconName } from "@/components/mobile/icon";
import { AppBar, MobileScreen } from "@/components/mobile/shell";
import type { RoleNames } from "@/lib/demo/roles";

type Step = {
  title: [string, string, string];
  native: string;
  desc: string[];
  descNative: string;
  art: ArtName;
  artWidth: number;
  features?: { icon: IconName; ko: string; native: string; desc: string[]; descNative: string }[];
  tip?: { ko: string; native: string; desc: string; descNative: string };
};

export default function GuidePage() {
  const nativeLanguage = useNativeLanguage();
  const buildSteps = (names: RoleNames): Step[] => [
    {
      title: ["안녕하세요,", "새싹로봇", "이에요."],
      native: nativeMessage(nativeLanguage, "w0.welcome.title"),
      desc: ["케어브릿지에서 말로 돌봄 기록을", "시작해 볼게요."],
      descNative: nativeMessage(nativeLanguage, "w0.welcome.description"),
      art: "robot-welcome",
      artWidth: 200,
      features: [
        {
          icon: "mic",
          ko: "음성으로 기록",
          native: nativeMessage(nativeLanguage, "w0.voice.title"),
          desc: ["복잡한 입력 없이", "바로 시작해요."],
          descNative: nativeMessage(nativeLanguage, "w0.voice.description"),
        },
        {
          icon: "helper",
          ko: "도우미에게 질문",
          native: nativeMessage(nativeLanguage, "w0.helper.title"),
          desc: ["모르는 말이나 돌봄 방법을", "알려 줘요."],
          descNative: nativeMessage(nativeLanguage, "w0.helper.description"),
        },
      ],
    },
    {
      title: ["말로 편하게", "기록", "해요."],
      native: nativeMessage(nativeLanguage, "w0.record.title"),
      desc: ["오늘 돌본 내용을 말하면", "AI가 항목별 기록 초안을 정리해줘요."],
      descNative: nativeMessage(nativeLanguage, "w0.record.description"),
      art: "robot-voice",
      artWidth: 340,
      features: [
        {
          icon: "mic",
          ko: "편하게 말하기",
          native: nativeMessage(nativeLanguage, "w0.speak.title"),
          desc: ["생각나는 대로", "자연스럽게 말해 보세요."],
          descNative: nativeMessage(nativeLanguage, "w0.speak.description"),
        },
        {
          icon: "doc",
          ko: "항목별 정리",
          native: nativeMessage(nativeLanguage, "w0.organize.title"),
          desc: ["식사, 수면, 활동 등으로", "정리돼요."],
          descNative: nativeMessage(nativeLanguage, "w0.organize.description"),
        },
      ],
    },
    {
      title: ["초안을 확인하고", "전송하면 끝", "이에요."],
      native: nativeMessage(nativeLanguage, "w0.confirm.title"),
      desc: ["AI가 만든 초안을 보고 필요한 부분만", `수정한 뒤 ${names.reviewer}에게 전송하세요.`],
      descNative: nativeMessage(nativeLanguage, "w0.confirm.description", {
        reviewer: names.reviewerNative,
      }),
      art: "robot-done",
      artWidth: 330,
      tip: {
        ko: "급하게 적지 않아도 돼요",
        native: nativeMessage(nativeLanguage, "w0.tip.title"),
        desc: "중요한 내용부터 차근차근 확인하세요.",
        descNative: nativeMessage(nativeLanguage, "w0.tip.description"),
      },
    },
  ];

  const router = useRouter();
  const joined = useSearchParams().get("joined");
  const demo = useDemo();
  const steps = buildSteps(useRoleNames());
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  const finish = () => {
    if (demo?.real) void demo.real.actions.setProfile({ onboarded: true });
    else demo?.update((db) => ({ ...db, onboarded: true }));
    router.push("/today");
  };

  return (
    <MobileScreen>
      <AppBar
        title="사용 안내"
        native={nativeMessage(nativeLanguage, "w0.title")}
        back={index === 0 ? "/" : () => setIndex(index - 1)}
      />
      {joined && index === 0 && (
        <p className="join-toast" role="status">
          {joined}
        </p>
      )}
      <div className="progress" aria-label={`${steps.length}장 중 ${index + 1}장`}>
        {steps.map((_, i) => (
          <span key={i} className={i === index ? "on" : ""} />
        ))}
      </div>
      <section className="hero" style={{ marginTop: 22 }}>
        <h1>
          {step.title[0]}
          <br />
          <em>{step.title[1]}</em>
          {step.title[2]}
        </h1>
        <Native as="p" className="hero-native native">
          {step.native}
        </Native>
        <p className="desc">
          {step.desc[0]}
          <br />
          {step.desc[1]}
        </p>
        <Native as="p" className="desc-native native">
          {step.descNative}
        </Native>
      </section>
      <div className="grow stack" style={{ justifyContent: "center", padding: "8px 0" }}>
        <Art name={step.art} width={step.artWidth} priority />
      </div>
      {step.features && (
        <div className="features">
          {step.features.map((feature) => (
            <div key={feature.ko} className="feature card">
              <div className="icon-bubble">
                <Icon name={feature.icon} />
              </div>
              <strong>{feature.ko}</strong>
              <Native className="f-native native">{feature.native}</Native>
              <p>
                {feature.desc[0]}
                <br />
                {feature.desc[1]}
              </p>
              <Native className="p-native native">{feature.descNative}</Native>
            </div>
          ))}
        </div>
      )}
      {step.tip && (
        <div className="tip card">
          <div className="icon-bubble">
            <Icon name="bulb" />
          </div>
          <div>
            <strong>{step.tip.ko}</strong>
            <Native className="f-native native">{step.tip.native}</Native>
            <p>{step.tip.desc}</p>
            <Native className="p-native native">{step.tip.descNative}</Native>
          </div>
        </div>
      )}
      <div className="pad" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (last ? finish() : setIndex(index + 1))}
        >
          <span className="spacer" />
          <span className="label">
            {last
              ? (nativeLanguage === "ko" ? "시작하기" : "시작하기 · ") +
                nativeMessage(nativeLanguage, "w0.start")
              : (nativeLanguage === "ko" ? "다음" : "다음 · ") +
                nativeMessage(nativeLanguage, "w0.next")}
          </span>
          <Icon name="next" />
        </button>
      </div>
      <button
        type="button"
        className="text-link"
        style={{ margin: "14px 0 24px" }}
        onClick={finish}
      >
        {(nativeLanguage === "ko" ? "건너뛰기" : "건너뛰기 · ") +
          nativeMessage(nativeLanguage, "w0.skip")}
      </button>
    </MobileScreen>
  );
}
