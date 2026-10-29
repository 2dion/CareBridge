// 시험 기관·계정 준비와 실행 정보(run.json).
// 매번 새 시험 기관 2개(일반·교육용)를 만들고, 고정 시험 계정 6개를 그 기관으로 옮긴다.
// 그래서 지난 실행의 기록이 화면에 섞이지 않고, 데모 기관(시연용)은 건드리지 않는다.
// 비밀번호는 실행마다 새로 만들어 이 PC의 e2e/.state/run.json에만 둔다(커밋되지 않음).
import crypto from "node:crypto";
import fs from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv, RUN_FILE, STATE_DIR } from "./env";

export type Role = "worker" | "worker2" | "worker3" | "manager" | "trainee" | "trainer";

export const ACCOUNTS: Record<
  Role,
  { email: string; name: string; role: "worker" | "reviewer"; lang: "ko" | "vi"; org: OrgKey }
> = {
  worker: {
    email: "e2e-worker@carebridge.test",
    name: "시험 작성자 가",
    role: "worker",
    lang: "vi",
    org: "general",
  },
  worker2: {
    email: "e2e-worker2@carebridge.test",
    name: "시험 작성자 나",
    role: "worker",
    lang: "vi",
    org: "general",
  },
  // 로그아웃·다시 로그인 점검 전용(로그아웃하면 그 계정의 다른 세션도 끊길 수 있어 따로 둔다)
  worker3: {
    email: "e2e-worker3@carebridge.test",
    name: "시험 작성자 다",
    role: "worker",
    lang: "vi",
    org: "general",
  },
  manager: {
    email: "e2e-manager@carebridge.test",
    name: "시험 관리자",
    role: "reviewer",
    lang: "ko",
    org: "general",
  },
  trainee: {
    email: "e2e-trainee@carebridge.test",
    name: "시험 교육생",
    role: "worker",
    lang: "vi",
    org: "training",
  },
  trainer: {
    email: "e2e-trainer@carebridge.test",
    name: "시험 강사",
    role: "reviewer",
    lang: "ko",
    org: "training",
  },
};

export type OrgKey = "general" | "training";

/** 시험 기관 이름 앞머리. 정리 SQL(supabase/e2e-cleanup.sql)이 이 이름으로 찾는다 */
export const ORG_PREFIX = "[E2E]";

export type RunInfo = {
  startedAt: string;
  orgs: Record<OrgKey, { id: string; name: string; workerCode: string; reviewerCode: string }>;
  users: Record<Role, { id: string; email: string; password: string; name: string }>;
};

export function adminClient(): SupabaseClient {
  const env = requireEnv();
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 헷갈리는 글자(0·O·1·I)를 뺀 대문자·숫자(DB join_codes 형식) */
function joinCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(10), (byte) => letters[byte % letters.length]).join("");
}

async function must<T>(
  label: string,
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as NonNullable<T>;
}

async function findUserId(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`계정 목록: ${error.message}`);
    const found = data.users.find((user) => user.email === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** 시험 기관 2개를 새로 만들고, 시험 계정 6개를 만들거나 그 기관으로 옮긴다 */
export async function prepareRun(): Promise<RunInfo> {
  const admin = adminClient();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const orgs = {} as RunInfo["orgs"];

  for (const [key, isTraining] of [
    ["general", false],
    ["training", true],
  ] as const) {
    const name = `${ORG_PREFIX} ${isTraining ? "시험 교육원" : "시험 요양센터"} ${stamp}`;
    const org = await must(
      `${name} 기관 만들기`,
      admin.from("organizations").insert({ name, is_training: isTraining }).select("id").single(),
    );
    const workerCode = joinCode();
    const reviewerCode = joinCode();
    await must(
      `${name} 가입 코드`,
      admin.from("join_codes").insert([
        { org_id: org.id, role: "worker", code: workerCode },
        { org_id: org.id, role: "reviewer", code: reviewerCode },
      ]),
    );
    orgs[key] = { id: org.id, name, workerCode, reviewerCode };
  }

  const users = {} as RunInfo["users"];
  for (const [role, account] of Object.entries(ACCOUNTS) as [Role, (typeof ACCOUNTS)[Role]][]) {
    const password = crypto.randomBytes(18).toString("base64url");
    let id = await findUserId(admin, account.email);
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw new Error(`${account.email} 비밀번호: ${error.message}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`${account.email} 만들기: ${error?.message}`);
      id = data.user.id;
    }
    // 매번 같은 출발점: 새 시험 기관, 사용 안내 본 상태, 보통 글씨
    await must(
      `${account.email} 프로필`,
      admin.from("profiles").upsert({
        id,
        org_id: orgs[account.org].id,
        role: account.role,
        name: account.name,
        native_lang: account.lang,
        font_size: 2,
        onboarded: true,
      }),
    );
    users[role] = { id, email: account.email, password, name: account.name };
  }

  const run: RunInfo = { startedAt: new Date().toISOString(), orgs, users };
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(RUN_FILE, JSON.stringify(run, null, 2));
  return run;
}

let cached: RunInfo | null = null;

export function readRun(): RunInfo {
  if (cached) return cached;
  if (!fs.existsSync(RUN_FILE)) {
    throw new Error("e2e/.state/run.json이 없습니다. `npm run test:e2e`로 처음부터 돌려 주세요.");
  }
  cached = JSON.parse(fs.readFileSync(RUN_FILE, "utf8")) as RunInfo;
  return cached;
}
