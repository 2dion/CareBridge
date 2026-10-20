import { connection } from "next/server";

import { getConfigStatus } from "@/lib/config";

// 배포·로컬 설정 확인용. 키 값은 돌려주지 않고 "있는지"만 알린다.
export async function GET() {
  await connection(); // 빌드 때 굳지 않고 요청마다 환경 변수를 읽게 한다.
  const status = getConfigStatus();
  return Response.json({ ok: status.problems.length === 0, ...status });
}
