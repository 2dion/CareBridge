import { nativeMessage } from "./i18n/messages";

// #105: 가입 동의와 W5 개인정보 안내가 같은 문구를 쓴다.
export const PRIVACY_SECTIONS = [
  {
    icon: "doc",
    ko: "수집·이용 목적",
    native: nativeMessage("vi", "privacy.purpose.title"),
    body: "돌봄 기록 초안 작성, 번역, 관리자 검토·승인, 도우미 답변과 교육·업무 지원. 같은 기관 사람만 열람",
    bodyNative: nativeMessage("vi", "privacy.purpose.body"),
  },
  {
    icon: "user",
    ko: "수집 항목",
    native: nativeMessage("vi", "privacy.data.title"),
    body: "이름, 이메일, 사용 언어, 녹음을 바꾼 글, 돌봄 기록 내용, 도우미에 물은 질문과 답(관리자·강사가 볼 수 있음). 어르신 실명·선택 사진은 대상 확인용으로 보관하며 AI 입력에 추가하지 않음. 관찰 본문에는 실명을 쓰지 않음",
    bodyNative: nativeMessage("vi", "privacy.data.body"),
  },
  {
    icon: "shield",
    ko: "보유·이용 기간",
    native: nativeMessage("vi", "privacy.retention.title"),
    body: "회원 탈퇴 시까지. 승인한 돌봄 기록은 관계 법령에 따른 기간 동안 보관. 녹음 파일은 글자로 바꾼 즉시 삭제. 사진은 교체·삭제 시 기존 파일 삭제",
    bodyNative: nativeMessage("vi", "privacy.retention.body"),
  },
  {
    icon: "alert",
    ko: "동의 거부 권리",
    native: nativeMessage("vi", "privacy.refusal.title"),
    body: "동의하지 않을 수 있어요. 다만 동의하지 않으면 서비스를 쓸 수 없어요.",
    bodyNative: nativeMessage("vi", "privacy.refusal.body"),
  },
] as const;
