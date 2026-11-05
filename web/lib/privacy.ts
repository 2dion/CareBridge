import type { NativeLang } from "./i18n/languages";
import { nativeMessage } from "./i18n/messages";

// #105: 가입 동의와 W5 개인정보 안내가 같은 문구를 쓴다.
/** 작성자 모국어로 병기한 개인정보 안내. 그 언어 번역 파일이 없으면 모국어 줄은 빈칸(한국어만 보임) */
export const privacySections = (lang: NativeLang) =>
  [
    {
      icon: "doc",
      ko: "수집·이용 목적",
      native: nativeMessage(lang, "privacy.purpose.title"),
      body: "돌봄 기록 초안 작성, 번역, 관리자 검토·승인, 도우미 답변과 교육·업무 지원. 같은 기관 사람만 열람",
      bodyNative: nativeMessage(lang, "privacy.purpose.body"),
    },
    {
      icon: "user",
      ko: "수집 항목",
      native: nativeMessage(lang, "privacy.data.title"),
      body: "이름, 이메일, 사용 언어, 녹음을 바꾼 글, 돌봄 기록 내용, 도우미에 물은 질문과 답. 어르신 실명·선택 사진은 대상 확인용으로 보관하며 AI 입력에 추가하지 않음. 관찰 본문에는 실명을 쓰지 않음",
      bodyNative: nativeMessage(lang, "privacy.data.body"),
    },
    {
      icon: "shield",
      ko: "보유·이용 기간",
      native: nativeMessage(lang, "privacy.retention.title"),
      body: "회원 탈퇴 시까지. 승인한 돌봄 기록은 관계 법령에 따른 기간 동안 보관. 녹음 파일은 글자로 바꾼 즉시 삭제. 사진은 교체·삭제 시 기존 파일 삭제",
      bodyNative: nativeMessage(lang, "privacy.retention.body"),
    },
    {
      icon: "alert",
      ko: "동의 거부 권리",
      native: nativeMessage(lang, "privacy.refusal.title"),
      body: "동의하지 않을 수 있어요. 다만 동의하지 않으면 서비스를 쓸 수 없어요.",
      bodyNative: nativeMessage(lang, "privacy.refusal.body"),
    },
  ] as const;
