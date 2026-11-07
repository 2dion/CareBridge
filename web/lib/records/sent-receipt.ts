// W3 전송 완료 화면용 짧은 영수증(이슈 #374, 결정 #367).
// 담당이 끝난 작성자가 남은 자기 기록을 전송하면, 전송 직후 재조회에서 그 기록이 권한(RLS)으로 빠진다.
// 그래도 완료 화면이 '불러오는 중'에 멈추지 않도록 돌봄 날짜·첫 전송 시각만 이 탭(sessionStorage)에 잠깐 둔다.
// 어르신 이름·사진·기록 본문은 넣지 않는다. 저장소를 못 쓰면 조용히 넘어가고 화면은 오늘 화면으로 보낸다.

export type SentReceipt = { careDate: string; firstSubmittedAt: string };

const KEY = (recordId: string) => `carebridge.sent.${recordId}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function saveSentReceipt(recordId: string, receipt: SentReceipt): void {
  try {
    window.sessionStorage.setItem(KEY(recordId), JSON.stringify(receipt));
  } catch {
    // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등): 완료 화면은 오늘 화면으로 넘어간다
  }
}

export function readSentReceipt(recordId: string): SentReceipt | null {
  try {
    const raw = window.sessionStorage.getItem(KEY(recordId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SentReceipt>;
    if (typeof value.careDate !== "string" || !DATE.test(value.careDate)) return null;
    if (
      typeof value.firstSubmittedAt !== "string" ||
      Number.isNaN(Date.parse(value.firstSubmittedAt))
    ) {
      return null;
    }
    return { careDate: value.careDate, firstSubmittedAt: value.firstSubmittedAt };
  } catch {
    return null;
  }
}
