// 코드 이유의 몽골어(키릴) 고정문. 한국어 원문(ko.ts의 REASONS 값)이 키다. 결정 2026-11-05-모국어추가.
// ⚠️ Claude 초안(검수 전). 성별을 정하지 않는 중립 표현을 쓴다.

import { REASONS } from "./ko";

export const REASONS_MN: Record<string, string> = {
  [REASONS.evidenceNotFound]: "Аман тэмдэглэлээс үндэслэл олдсонгүй",
  [REASONS.evidenceTooShort]: "Үндэслэл болгосон өгүүлбэр хэт богино байна",
  [REASONS.observedWithoutEvidence]: "Үндэслэл болгосон өгүүлбэр байхгүй",
  [REASONS.supportMinutesExceed]: "Туслалцааны хугацааны нийлбэр айлчлалын хугацаанаас урт байна",
  [REASONS.visitMinutesMissing]:
    "Айлчлалын хугацаа байхгүй тул туслалцааны хугацааны нийлбэрийг шалгах боломжгүй",
  [REASONS.realName]: "Агуулгад жинхэнэ нэр орсон байна",
  [REASONS.invalidMinutes]: "Туслалцааны хугацааны хэлбэр буруу байна",
  [REASONS.noReason]: "AI шалтгаан өгөөгүй",
  [REASONS.observedWithoutValue]: "Агуулга байхгүй",
  [REASONS.intakeUnknown]: "Хоолны хэмжээг тодорхойлж чадсангүй",
  [REASONS.questionInValue]: "Баталгаажуулалт хүссэн өгүүлбэрийг шалтгаан руу зөөсөн",
  [REASONS.trendWithoutComparison]:
    "Харьцуулсан тайлбар байхгүй тул танин мэдэхүйн өөрчлөлтийг (сайжирсан/хэвээр/муудсан) тодорхойлох боломжгүй",
  [REASONS.visibleSign]:
    "Арьс/биед харагдах өөрчлөлт (улайлт, шарх, хөхрөлт, хавдар...) тул менежер баталгаажуулах шаардлагатай",
  [REASONS.medicationGuess]: "Тэмдэглэгч эм уусныг биечлэн баталгаажуулаагүй (таамаглал)",
  [REASONS.invalidShape]: "Хэлбэр буруу байна",
  [REASONS.autoStop]: "Агуулгыг автоматаар зохион байгуулахыг зогсоосон",
};
