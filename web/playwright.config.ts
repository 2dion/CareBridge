// 자동 점검(Playwright) 설정. 실행 방법과 점검 목록은 e2e/README.md.
// 공용 Supabase에 시험 기관을 새로 만들어 돌고, 데모 기관(시연용)은 건드리지 않는다.
import { defineConfig, devices } from "@playwright/test";

import { AI_ON, authFile, BASE_URL, DESKTOP, loadEnv, MOBILE } from "./e2e/support/env";

loadEnv();

const chrome = devices["Desktop Chrome"];

// `--project=logic`만 돌릴 때는 앱을 띄우지 않는다(키·서버 없이 코드 검사만)
const args = process.argv.join(" ");
const onlyLogic = /--project[= ]logic(\s|$)/.test(args) && !/--project[= ](?!logic)/.test(args);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.state/results",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS) || 2,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "./e2e/.state/report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  projects: [
    // 키·계정 없이 도는 코드 검사(서버 검사 함수 등)
    { name: "logic", testDir: "./e2e/logic", use: { ...chrome } },
    // 시험 기관·계정 만들기 + 계정별 로그인 쿠키
    { name: "setup", testMatch: /accounts\.setup\.ts/, use: { ...chrome } },
    // 서버 API·DB 권한(RLS) 점검. 화면 없이 계정별로 부른다
    { name: "api", testDir: "./e2e/api", dependencies: ["setup"], use: { ...chrome } },
    // 작성자 화면(W). 휴대폰 크기
    {
      name: "worker",
      testDir: "./e2e/worker",
      dependencies: ["setup"],
      use: { ...chrome, viewport: MOBILE, storageState: authFile("worker") },
    },
    // 관리자 화면(M). PC 크기
    {
      name: "manager",
      testDir: "./e2e/manager",
      dependencies: ["setup"],
      use: { ...chrome, viewport: DESKTOP, storageState: authFile("manager") },
    },
    // 실제 AI(Claude) 품질 점검. E2E_AI=1일 때만(비용·시간이 큼)
    ...(AI_ON
      ? [
          {
            name: "ai",
            testDir: "./e2e/ai",
            dependencies: ["setup"],
            timeout: 600_000,
            use: { ...chrome, viewport: MOBILE, storageState: authFile("worker") },
          },
        ]
      : []),
  ],
  // E2E_BASE_URL이 없으면 이 PC에서 앱을 띄운다. AI 점검이 아니면 Claude를 부르지 않는다
  webServer:
    process.env.E2E_BASE_URL || onlyLogic
      ? undefined
      : {
          command: "npm run dev -- --port 3100",
          url: `${BASE_URL}/api/health`,
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
          env: { USE_MOCK_AI: AI_ON ? "false" : "true" },
        },
});
