// 자동 점검이 읽는 환경 변수. web/.env.local을 그대로 쓴다(앱과 같은 Supabase).
// 키 값은 화면·로그·파일에 남기지 않는다. 없으면 무엇을 채워야 하는지만 알린다.
import fs from "node:fs";
import path from "node:path";

export const WEB_DIR = path.resolve(__dirname, "..", "..");
export const STATE_DIR = path.join(WEB_DIR, "e2e", ".state");
export const RUN_FILE = path.join(STATE_DIR, "run.json");

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const file = path.join(WEB_DIR, ".env.local");
  // 이미 있는 환경 변수는 덮어쓰지 않는다(명령줄에서 준 값이 먼저)
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

export function requireEnv() {
  loadEnv();
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `web/.env.local에 ${missing.join(", ")}가 없습니다. 자동 점검은 공용 Supabase에 시험 기관을 만들어서 돌기 때문에 service_role 키가 필요합니다. 키는 백엔드 담당에게 DM으로 받으세요.`,
    );
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

// 아래 값(E2E_AI·E2E_BASE_URL)도 .env.local에 둘 수 있게 먼저 읽는다
loadEnv();

/** 실제 AI를 부르는 점검(ai 프로젝트)을 켰는지. 기본은 꺼짐(비용·시간).
 *  `npm run test:e2e:ai`(--project=ai) 또는 E2E_AI=1로 켠다 */
export const AI_ON =
  process.env.E2E_AI === "1" || /--project[= ]ai(\s|$)/.test(process.argv.join(" "));

/** 배포본 등 이미 떠 있는 주소로 돌릴 때. 비우면 로컬 next dev(3100)를 띄운다 */
export const BASE_URL = process.env.E2E_BASE_URL?.replace(/\/$/, "") || "http://localhost:3100";

/** 계정별 로그인 쿠키 파일(준비 단계가 만듦). role은 support/run.ts의 Role */
export const authFile = (role: string) => path.join(STATE_DIR, `auth-${role}.json`);

/** 작성자 화면은 휴대폰 크기, 관리자 화면은 PC 크기로 연다 */
export const MOBILE = { width: 390, height: 844 };
export const DESKTOP = { width: 1366, height: 900 };
