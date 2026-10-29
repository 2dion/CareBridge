// 모든 점검이 같이 쓰는 도구: 시험 계정으로 로그인한 DB·API, 시험 데이터 만들기.
// 데이터는 점검마다 새 어르신을 만들어 서로 섞이지 않게 한다(병렬 실행 가능).
import crypto from "node:crypto";

import {
  type APIRequestContext,
  test as base,
  expect,
  type Page,
  request as playwrightRequest,
} from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Draft, ItemKey } from "./drafts";
import { authFile, BASE_URL, requireEnv } from "./env";
import { adminClient, readRun, type Role, type RunInfo } from "./run";

export { authFile, expect };

/** 한국 날짜(YYYY-MM-DD). daysAgo=1이면 어제 */
export function kstDate(daysAgo = 0) {
  const now = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 한국 날짜의 ISO 요일(1=월 … 7=일). DB 방문 요일(visit_days)과 같은 번호 */
export function kstIsoDow(daysAgo = 0) {
  const [y, m, d] = kstDate(daysAgo).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

const clients = new Map<Role, Promise<SupabaseClient>>();

/** 시험 계정으로 로그인한 Supabase 클라이언트(RLS가 그대로 걸림) */
export function dbAs(role: Role) {
  if (!clients.has(role)) {
    clients.set(
      role,
      (async () => {
        const env = requireEnv();
        const run = readRun();
        const client = createClient(env.url, env.publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error } = await client.auth.signInWithPassword({
          email: run.users[role].email,
          password: run.users[role].password,
        });
        if (error) throw new Error(`${role} 로그인: ${error.message}`);
        return client;
      })(),
    );
  }
  return clients.get(role)!;
}

/** 앱 서버 API(/api/...)를 그 계정 쿠키로 부른다 */
export async function apiAs(role: Role): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: BASE_URL, storageState: authFile(role) });
}

/** 응답 본문(JSON)과 코드를 같이 돌려준다 */
export async function call(
  api: APIRequestContext,
  method: "POST" | "PATCH" | "GET",
  url: string,
  body?: unknown,
) {
  const response = await api.fetch(url, {
    method,
    ...(body === undefined ? {} : { data: body }),
    timeout: 120_000,
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status(), body: json };
}

export type Seed = ReturnType<typeof makeSeed>;

function makeSeed(run: RunInfo) {
  const admin = adminClient();
  const short = () => crypto.randomBytes(3).toString("hex");

  async function must<T>(label: string, query: PromiseLike<{ data: T; error: unknown }>) {
    const { data, error } = await query;
    if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
    return data as NonNullable<T>;
  }

  return {
    admin,
    run,
    /** 새 합성 어르신과 담당 연결. 가명은 '시험 ○○ 3f9a1c'처럼 매번 다름 */
    async resident(
      opts: {
        careType?: "facility" | "home";
        org?: "general" | "training";
        workers?: Role[];
        /** 재가 방문 요일(ISO: 1=월 … 7=일). 주지 않으면 비움(null) */
        visitDays?: number[] | null;
        /** 담당 시작일: 오늘에서 며칠 전(기본 7, 지난 7일이 모두 계산에 듦) */
        startDaysAgo?: number;
      } = {},
    ) {
      const org = opts.org ?? "general";
      const workers = opts.workers ?? [org === "training" ? "trainee" : "worker"];
      const alias = `시험 ○○ ${short()}`;
      const resident = await must(
        "어르신 만들기",
        admin
          .from("residents")
          .insert({
            org_id: run.orgs[org].id,
            alias,
            care_type: opts.careType ?? "facility",
            is_synthetic: true,
          })
          .select("id")
          .single(),
      );
      for (const role of workers) {
        await must(
          "담당 연결",
          admin.from("assignments").insert({
            worker_id: run.users[role].id,
            resident_id: resident.id,
            schedule: opts.careType === "home" ? "평일 14:00~17:00" : "매일",
            visit_days: opts.visitDays === undefined ? null : opts.visitDays,
            start_date: kstDate(opts.startDaysAgo ?? 7),
          }),
        );
      }
      return { id: resident.id as string, alias };
    },

    /**
     * 기록 하나를 원하는 단계까지 만든다.
     * draft → (confirmAll) → (submit) 순서이고, 앱과 같은 길(작성자 DB·서버 API)을 쓴다.
     */
    async record(opts: {
      residentId: string;
      worker?: Role;
      careDate?: string;
      transcript?: string;
      draft?: Draft;
      visit?: { start: string; end: string };
      confirmAll?: boolean;
      submit?: boolean;
      /** true면 녹음 기록처럼 audio_jobs(target=record) 한 줄을 둔다. 기본은 글로 쓴 기록 */
      voice?: boolean;
    }) {
      const role = opts.worker ?? "worker";
      const db = await dbAs(role);
      const created = await must(
        "기록 만들기",
        db
          .from("records")
          .insert({ resident_id: opts.residentId, care_date: opts.careDate ?? kstDate() })
          .select("id")
          .single(),
      );
      const id = created.id as string;
      if (opts.draft) {
        const transcript = opts.transcript ?? opts.draft.transcript_ko;
        await must(
          "원문 저장",
          db
            .from("records")
            .update({
              transcript,
              ...(opts.visit ? { visit_start: opts.visit.start, visit_end: opts.visit.end } : {}),
            })
            .eq("id", id),
        );
        if (opts.voice) {
          await must(
            "녹음 작업 기록",
            admin.from("audio_jobs").insert({
              record_id: id,
              org_id: (
                await must("기관", admin.from("records").select("org_id").eq("id", id).single())
              ).org_id,
              worker_id: run.users[role].id,
              target: "record",
              // 받아쓰기가 끝난 녹음은 경로를 비운다(녹음 파일은 지워진 상태)
              status: "done",
              storage_path: null,
            }),
          );
        }
        await must(
          "초안 저장",
          admin.rpc("save_record_ai_draft", {
            p_record_id: id,
            p_worker_id: run.users[role].id,
            p_expected_transcript: transcript,
            p_draft: opts.draft,
          }),
        );
      }
      if (opts.confirmAll || opts.submit) await this.confirmAll(id, role);
      if (opts.submit) {
        const api = await apiAs(role);
        const result = await call(api, "POST", `/api/records/${id}/submit`);
        await api.dispose();
        if (result.status !== 200) throw new Error(`전송 실패: ${JSON.stringify(result)}`);
      }
      return id;
    },

    /** 9개 항목을 [맞아요]로 확인(서버 API PATCH confirmed_by_worker) */
    async confirmAll(recordId: string, role: Role = "worker") {
      const api = await apiAs(role);
      const items = await this.items(recordId);
      for (const item of items) {
        if (item.confirmed_by_worker || item.source === "worker") continue;
        const result = await call(api, "PATCH", `/api/records/${recordId}/items/${item.item_key}`, {
          confirmed_by_worker: true,
        });
        if (result.status !== 200) throw new Error(`확인 실패: ${JSON.stringify(result)}`);
      }
      await api.dispose();
    },

    /** 관리자가 '확인 필요'를 모두 [확인함]으로 정함 */
    async resolveAll(recordId: string, role: Role = "manager") {
      const api = await apiAs(role);
      for (const item of await this.items(recordId)) {
        if (item.status !== "needs_check" || item.resolution) continue;
        const result = await call(api, "PATCH", `/api/records/${recordId}/items/${item.item_key}`, {
          resolution: "confirmed_by_reviewer",
        });
        if (result.status !== 200) throw new Error(`확인함 실패: ${JSON.stringify(result)}`);
      }
      await api.dispose();
    },

    async items(recordId: string) {
      return (await must(
        "항목 읽기",
        admin.from("record_items").select("*").eq("record_id", recordId),
      )) as {
        item_key: ItemKey;
        status: string;
        value_ko: string;
        reason: string;
        evidence: string;
        source: string;
        confirmed_by_worker: boolean;
        resolution: string | null;
        detail: Record<string, unknown>;
      }[];
    },

    async recordRow(recordId: string) {
      return (await must(
        "기록 읽기",
        admin.from("records").select("*").eq("id", recordId).single(),
      )) as Record<string, unknown>;
    },
  };
}

export const test = base.extend<{ seed: Seed; run: RunInfo }>({
  // 두 번째 인자는 Playwright의 'use'. React 훅 검사와 이름이 겹치지 않게 provide로 부른다
  run: async ({}, provide) => {
    await provide(readRun());
  },
  seed: async ({ run }, provide) => {
    await provide(makeSeed(run));
  },
});

/** 화면을 열고 '불러오는 중'이 끝날 때까지 기다린다 */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
