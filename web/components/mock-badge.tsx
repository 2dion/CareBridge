import { connection } from "next/server";

import { getAiMode } from "@/lib/config";

// Mock 모드면 화면 위에 "MOCK"을 띄운다(코디세이api-v1.0 §2, 기술검토 v1.5 3장 #4).
// 인쇄에는 나오지 않게 print:hidden.
export async function MockBadge() {
  await connection();
  if (getAiMode() !== "mock") return null;
  return (
    <div className="bg-amber-300 px-4 py-1 text-center text-sm font-bold text-black print:hidden">
      MOCK · AI·받아쓰기는 가짜 응답입니다
    </div>
  );
}
