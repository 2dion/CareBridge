"use client";

// W0(사용 안내): 처음 한 번 3장. 로그인 전·처음 보는 곳이라 병기(화면 v1.3 병기 원칙 ③ 예외).
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Art, type ArtName } from "@/components/mobile/art";
import { Icon, type IconName } from "@/components/mobile/icon";
import { AppBar, MobileScreen } from "@/components/mobile/shell";

type Step = {
  title: [string, string, string];
  vi: string;
  desc: string[];
  descVi: string;
  art: ArtName;
  artWidth: number;
  features?: { icon: IconName; ko: string; vi: string; desc: string[]; descVi: string }[];
  tip?: { ko: string; vi: string; desc: string; descVi: string };
};

const steps: Step[] = [
  {
    title: ["안녕하세요,", "새싹로봇", "이에요."],
    vi: "Xin chào, tôi là robot Mầm non.",
    desc: ["케어브릿지에서 말로 돌봄 기록을", "시작해 볼게요."],
    descVi: "Cùng CareBridge ghi chép bằng giọng nói.",
    art: "robot-welcome",
    artWidth: 200,
    features: [
      {
        icon: "mic",
        ko: "말로 기록",
        vi: "Ghi bằng giọng nói",
        desc: ["복잡한 입력 없이", "바로 시작해요."],
        descVi: "Bắt đầu dễ dàng.",
      },
      {
        icon: "doc",
        ko: "쉽게 확인",
        vi: "Dễ kiểm tra",
        desc: ["AI가 내용을 정리해", "초안을 보여줘요."],
        descVi: "AI soạn bản nháp.",
      },
    ],
  },
  {
    title: ["말로 편하게", "기록", "해요."],
    vi: "Ghi chép dễ dàng bằng giọng nói",
    desc: ["오늘 돌본 내용을 말하면", "AI가 항목별 기록 초안을 정리해줘요."],
    descVi: "AI soạn bản nháp từ lời kể chăm sóc.",
    art: "robot-voice",
    artWidth: 340,
    features: [
      {
        icon: "mic",
        ko: "음성으로 입력",
        vi: "Nhập bằng giọng nói",
        desc: ["타이핑 없이", "자연스럽게 말해 보세요."],
        descVi: "Cứ nói tự nhiên.",
      },
      {
        icon: "doc",
        ko: "항목별 정리",
        vi: "Sắp xếp theo mục",
        desc: ["식사, 수면, 활동 등으로", "정리돼요."],
        descVi: "Bữa ăn, giấc ngủ, hoạt động.",
      },
    ],
  },
  {
    title: ["초안을 확인하고", "보내면 끝", "이에요."],
    vi: "Kiểm tra bản nháp rồi gửi là xong.",
    desc: ["AI가 만든 초안을 보고 필요한 부분만", "수정한 뒤 담당자에게 보내세요."],
    descVi: "Sửa phần cần thiết rồi gửi người phụ trách.",
    art: "robot-done",
    artWidth: 290,
    tip: {
      ko: "급하게 적지 않아도 돼요",
      vi: "Không cần vội ghi chép.",
      desc: "중요한 내용부터 차근차근 확인하세요.",
      descVi: "Kiểm tra nội dung quan trọng trước.",
    },
  },
];

export default function GuidePage() {
  const router = useRouter();
  const demo = useDemo();
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  const finish = () => {
    demo?.update((db) => ({ ...db, onboarded: true }));
    router.push("/today");
  };

  return (
    <MobileScreen>
      <AppBar
        title="사용 안내"
        vi="Hướng dẫn"
        viAlways
        back={index === 0 ? "/" : () => setIndex(index - 1)}
      />
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
        <p className="hero-vi vi">{step.vi}</p>
        <p className="desc">
          {step.desc[0]}
          <br />
          {step.desc[1]}
        </p>
        <p className="desc-vi vi">{step.descVi}</p>
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
              <span className="f-vi vi">{feature.vi}</span>
              <p>
                {feature.desc[0]}
                <br />
                {feature.desc[1]}
              </p>
              <span className="p-vi vi">{feature.descVi}</span>
            </div>
          ))}
        </div>
      )}
      {step.tip && (
        <div className="tip">
          <Icon name="bulb" />
          <div>
            <strong>{step.tip.ko}</strong>
            <span className="vi" style={{ fontSize: 13 }}>
              {step.tip.vi}
            </span>
            <p>{step.tip.desc}</p>
            <span className="vi">{step.tip.descVi}</span>
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
          <span className="label">{last ? "시작하기 · Bắt đầu" : "다음 · Tiếp"}</span>
          <Icon name="next" />
        </button>
      </div>
      <button
        type="button"
        className="text-link"
        style={{ margin: "14px 0 24px" }}
        onClick={finish}
      >
        건너뛰기 · Bỏ qua
      </button>
    </MobileScreen>
  );
}
