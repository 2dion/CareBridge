// 도우미(W6)가 모델 없이 서버가 붙이는 고정 답의 모국어 문구: 교재에 없음 안내, 건강·안전 보고 안내, 건강·안전 낱말.
// 언어를 더하면 HELPER_FIXED에 한 줄을 더한다(결정 2026-11-05-모국어추가, 이슈 #312). 없는 언어는 빈칸(한국어만 보임).
// 관리자·강사 이름은 용어집 '사람·기관'과 같다. ⚠️ zh·mn·en은 Claude 초안(검수 전).
import type { NativeLang } from "@/lib/i18n/languages";

type FixedText = {
  /** 일반 기관의 관리자 / 교육용 기관의 강사 */
  reviewer: string;
  trainer: string;
  /** 교재에서 찾지 못했을 때. who = 위 이름 */
  notFound(who: string): string;
  /** 건강·안전 질문일 때 바로 보고하라는 안내 */
  safety(who: string): string;
  /** 질문(원문·번역)에 있으면 건강·안전 질문으로 보는 낱말. 소문자 부분 일치 */
  keywords: readonly string[];
};

const MN_CASE: Record<string, { from: string; to: string }> = {
  менежер: { from: "менежерээс", to: "менежерт" },
  багш: { from: "багшаас", to: "багшид" },
};

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export const HELPER_FIXED: Partial<Record<NativeLang, FixedText>> = {
  vi: {
    reviewer: "người quản lý",
    trainer: "giảng viên",
    notFound: (who) => `Mình không tìm thấy nội dung này trong giáo trình. Vui lòng hỏi ${who}.`,
    safety: (who) => `Hãy báo ngay cho ${who}.`,
    keywords: [
      "ngã",
      "té",
      "khó thở",
      "ngạt",
      "nghẹn",
      "nghẹt thở",
      "sặc",
      "bất tỉnh",
      "hôn mê",
      "ngất",
      "lơ mơ",
      "đau",
      "chảy máu",
      "ra máu",
      "thuốc hai lần",
      "thuốc 2 lần",
      "nhầm thuốc",
      "quá liều",
    ],
  },
  zh: {
    reviewer: "管理员",
    trainer: "讲师",
    notFound: (who) => `教材里没有找到这个内容。请询问${who}。`,
    safety: (who) => `请立即向${who}报告。`,
    keywords: [
      "摔倒",
      "跌倒",
      "摔了",
      "呼吸困难",
      "喘不",
      "不能呼吸",
      "窒息",
      "噎",
      "呛",
      "昏迷",
      "失去意识",
      "不省人事",
      "疼",
      "痛",
      "流血",
      "出血",
      "吃了两次药",
      "药吃了两遍",
      "吃错药",
      "药物过量",
      "用药过量",
    ],
  },
  mn: {
    // 몽골어는 '~에게 묻다/보고하다'가 격 어미를 쓰므로 이름이 문장 안에서 바뀐다: notFound=탈격(-аас), safety=여격(-т)
    reviewer: "менежер",
    trainer: "багш",
    // 두 문구 모두 이름이 문장 첫머리라 격 어미를 붙인 뒤 첫 글자를 대문자로 쓴다(#315 확인: "менежерт…"로 시작하던 문제)
    notFound: (who) =>
      `Сурах бичгээс энэ агуулгыг олсонгүй. ${capitalize(MN_CASE[who]?.from ?? who)} асууна уу.`,
    safety: (who) => `${capitalize(MN_CASE[who]?.to ?? who)} нэн даруй мэдэгдээрэй.`,
    keywords: [
      "унаж",
      "унасан",
      "уналаа",
      "уналт",
      "амьсгал",
      "амьсгаа боогд",
      "багтарч",
      "хахаж",
      "ухаан",
      "өвд",
      "өвдөл",
      "цус гарч",
      "цус алдаж",
      "цус алдал",
      "эм хоёр удаа",
      "эмийг хоёр удаа",
      "эм буруу",
      "хэтрүүлэн уу",
    ],
  },
  en: {
    reviewer: "manager",
    trainer: "instructor",
    notFound: (who) => `I couldn't find this in the textbook. Please ask the ${who}.`,
    safety: (who) => `Please report to the ${who} right away.`,
    keywords: [
      // "fell asleep"(잠듦)에 걸리지 않게 넘어짐 표현만 쓴다(이슈 #349)
      "fell down",
      "fell over",
      "fell off",
      "fell out of",
      "fell in the",
      "fell on the",
      "fell from",
      "fallen down",
      "fallen over",
      "a fall",
      "fall down",
      "collapsed",
      "breath",
      "choke",
      "choking",
      "unconscious",
      "passed out",
      "faint",
      "pain",
      "hurts",
      "bleeding",
      "blood",
      "medicine twice",
      "medication twice",
      "pills twice",
      "wrong medicine",
      "wrong medication",
      "overdose",
    ],
  },
};

/** 모국어 고정 문구에 넣을 관리자 이름(교육용 기관이면 강사) */
export function reviewerNameIn(lang: NativeLang, training: boolean): string | undefined {
  const fixed = HELPER_FIXED[lang];
  return fixed ? (training ? fixed.trainer : fixed.reviewer) : undefined;
}
