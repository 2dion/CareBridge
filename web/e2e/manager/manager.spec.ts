// 관리자 화면(M) 점검. PC 크기, 시험 관리자 계정으로 로그인한 상태에서 돈다.
// [계획 …]은 테스트 계획 줄, [#번호]는 이슈. 안 고친 이슈는 실패하는 것이 정상이다.
import type { Page } from "@playwright/test";

import { authFile } from "../support/env";
import { apiAs, call, dbAs, expect, kstDate, open, test } from "../support/fixtures";
import { facilityDraft } from "../support/drafts";

/** M2 오른쪽 항목 카드(aria-label = 항목 이름) */
const card = (page: Page, label: string) => page.locator(`article.ritem[aria-label="${label}"]`);
const cardOrder = (page: Page) =>
  page
    .locator("article.ritem")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));

test.describe("역할별 화면 막기", () => {
  test("[#114] 관리자가 작성자 화면 주소를 열면 검토 대기로 돌아간다", async ({ page }) => {
    for (const url of ["/today", "/archive", "/helper"]) {
      await page.goto(url);
      await expect(page, url).toHaveURL(/\/review$/);
    }
  });
});

test.describe("M1 검토 대기", () => {
  test("[계획 승인-2] 되돌린 뒤 다시 전송한 기록이 검토 대기에 '재전송'으로 다시 뜬다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    const manager = await apiAs("manager");
    await call(manager, "POST", `/api/records/${id}/return`, { reason: "[식사] 다시 확인" });
    await manager.dispose();
    await seed.confirmAll(id);
    const worker = await apiAs("worker");
    expect((await call(worker, "POST", `/api/records/${id}/submit`)).status).toBe(200);
    await worker.dispose();

    await open(page, "/review");
    const row = page.locator("tr", { hasText: resident.alias });
    await expect(row).toBeVisible();
    await expect(row.getByRole("img", { name: "재전송" })).toBeVisible();
  });

  test("[계획 작성전-3] 작성자가 남긴 '기록 없음' 사유가 검토 대기에 보인다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const worker = await dbAs("worker");
    await worker.from("no_care_days").insert({
      resident_id: resident.id,
      care_date: kstDate(1),
      reason: "other",
      note: "시험 사유 가족 외출",
    });
    await open(page, "/review");
    await page.getByRole("button", { name: /지난 7일 작성 전 기록/ }).click();
    await expect(
      page.locator("li", { hasText: resident.alias }).filter({ hasText: "기록 없음" }),
    ).toContainText("시험 사유 가족 외출");
  });

  test("[계획 지연전송-1] 7일 전 기록을 오늘 처음 전송하면 '지연전송 · 7일 뒤'가 보인다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({
      residentId: resident.id,
      careDate: kstDate(7),
      draft: facilityDraft(),
      submit: true,
    });
    await open(page, "/review");
    await page.getByRole("combobox", { name: "날짜" }).selectOption("all");
    await expect(page.locator("tr", { hasText: resident.alias })).toContainText(
      "지연전송 · 7일 뒤",
    );
    await open(page, `/review/${id}`);
    await expect(page.locator(".page-head")).toContainText("지연전송 · 7일 뒤");
  });

  test("[#136] [처리 지우기]를 누르면 바로 지우지 않고 한 번 더 묻는다", async ({ page, seed }) => {
    const resident = await seed.resident();
    const worker = await dbAs("worker");
    await worker.from("no_care_days").insert({
      resident_id: resident.id,
      care_date: kstDate(1),
      reason: "hospital",
      note: "",
    });
    await open(page, "/review");
    await page.getByRole("button", { name: /지난 7일 작성 전 기록/ }).click();
    await page
      .locator("li", { hasText: resident.alias })
      .filter({ hasText: "기록 없음" })
      .getByRole("button", { name: "처리 지우기" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const { data } = await seed.admin
      .from("no_care_days")
      .select("care_date")
      .eq("resident_id", resident.id);
    expect(data, "확인 전에는 지워지지 않음").toHaveLength(1);
  });
});

test.describe("M2 검토 화면", () => {
  test("[계획 승인-1] '확인 필요'를 모두 정하기 전에는 [승인]이 잠겨 있다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    await open(page, `/review/${id}`);
    const approve = page.getByRole("button", { name: "승인", exact: true });
    await expect(approve).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "확인 필요 2개 남음" })).toBeVisible();
    await card(page, "식사").getByRole("button", { name: "확인함" }).click();
    await card(page, "불편감 표현").getByRole("button", { name: "확인함" }).click();
    await expect(approve).toBeEnabled();
  });

  test("[#136] [승인]을 누르면 한 번 더 묻고, [취소]하면 승인되지 않는다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    await seed.resolveAll(id);
    await open(page, `/review/${id}`);
    await page.getByRole("button", { name: "승인", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "취소" }).click();
    await page.waitForTimeout(1500);
    expect((await seed.recordRow(id)).status).toBe("submitted");
  });

  test("[#136] [되돌리기]를 빠르게 두 번 눌러도 요청은 한 번만 간다", async ({ page, seed }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    let requests = 0;
    await page.route(`**/api/records/${id}/return`, async (route) => {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await open(page, `/review/${id}`);
    await page.getByRole("button", { name: "되돌리기" }).click();
    const dialog = page.getByRole("dialog", { name: "작성자에게 되돌리기" });
    await dialog.locator("#return-reason").fill("식사량을 다시 확인해 주세요.");
    const send = dialog.getByRole("button", { name: "되돌리기" });
    await send.click();
    await send.click({ force: true, timeout: 2000 }).catch(() => {});
    await expect(page).toHaveURL(/\/review$/, { timeout: 30_000 });
    expect(requests).toBe(1);
  });

  test("[#140] [확인함]을 누르면 '확인함 · 처리한 사람 · 시각'이 보인다", async ({
    page,
    seed,
    run,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    await open(page, `/review/${id}`);
    await card(page, "식사").getByRole("button", { name: "확인함" }).click();
    const resolved = card(page, "식사").locator(".resolved");
    await expect(resolved).toContainText("확인함");
    await expect(resolved).toContainText(run.users.manager.name);
    await expect(resolved).not.toHaveText(/확인함 ·\s*(바꾸기)?$/);
  });

  test("[#140] [기록 안 함]으로 정해도 빈 구분점 없이 이름·사유가 보인다", async ({
    page,
    seed,
    run,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    await open(page, `/review/${id}`);
    const meal = card(page, "식사");
    await meal.getByRole("button", { name: "기록 안 함" }).click();
    await meal.locator("#omit-meal").fill("원문만으로 판단할 수 없음");
    await meal.getByRole("button", { name: "기록 안 함으로 정하기" }).click();
    const resolved = meal.locator(".resolved");
    await expect(resolved).toContainText(run.users.manager.name);
    await expect(resolved).not.toContainText("·  ·");
  });

  test("[#140] '확인 필요'를 처리해도 항목 카드 순서가 그대로다", async ({ page, seed }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    await open(page, `/review/${id}`);
    const before = await cardOrder(page);
    await card(page, "식사").getByRole("button", { name: "확인함" }).click();
    await expect(card(page, "식사").locator(".resolved")).toBeVisible();
    expect(await cardOrder(page)).toEqual(before);
  });

  test("[#134] 관리자가 문장을 고친 항목에 옛 확인 이유가 '지금 이유'처럼 남지 않는다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    const manager = await apiAs("manager");
    const edited = await call(manager, "PATCH", `/api/records/${id}/items/meal`, {
      value_ko: "점심 일반식 1/2 이상 섭취함(직접 확인)",
    });
    expect(edited.status).toBe(200);
    await manager.dispose();
    await open(page, `/review/${id}`);
    const meal = card(page, "식사");
    const oldReason = facilityDraft().items.find((item) => item.item_key === "meal")!.reason;
    const reasonLine = meal.locator("p.reason");
    await expect(meal).toContainText("점심 일반식 1/2 이상 섭취함");
    // 옛 이유 문장이 이유 줄에 그대로 남으면 '고치기 전'이라고 밝혀야 한다
    if ((await reasonLine.count()) > 0 && (await reasonLine.innerText()).includes(oldReason)) {
      await expect(reasonLine).toContainText("고치기 전");
    }
    // 옛 근거를 노랗게 보인다면 '고치기 전 근거'라고 밝혀야 한다
    await meal.click();
    if ((await page.locator(".source-panel .line.hl").count()) > 0) {
      await expect(page.locator(".source-panel .hint-note")).toContainText("고치기 전");
    }
  });

  test("[#124] 작성자가 고친 항목을 관리자가 다시 고쳐도 요약 띠에 작성자 수정이 남고, '기록 안 함'은 수정으로 세지 않는다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft() });
    const worker = await apiAs("worker");
    await call(worker, "PATCH", `/api/records/${id}/items/sleep`, {
      value_ko: "밤에 두 번 깨셨음",
    });
    await seed.confirmAll(id);
    expect((await call(worker, "POST", `/api/records/${id}/submit`)).status).toBe(200);
    await worker.dispose();

    const manager = await apiAs("manager");
    await call(manager, "PATCH", `/api/records/${id}/items/sleep`, { value_ko: "밤에 두 번 깨심" });
    await call(manager, "PATCH", `/api/records/${id}/items/meal`, {
      resolution: "omitted",
      resolution_note: "원문만으로 판단할 수 없음",
    });
    await manager.dispose();

    await open(page, `/review/${id}`);
    const summary = page.locator(".panel.summary");
    await expect(summary).toContainText(/작성자 수정: [^·]*수면/);
    await expect(summary).not.toContainText(/관리자 수정: [^·]*식사/);
  });
});

test.describe("M3 승인한 기록", () => {
  test("[#124] 처리 이력에 첫 전송·되돌림(사유)·재전송이 모두 나온다", async ({ page, seed }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    const manager = await apiAs("manager");
    await call(manager, "POST", `/api/records/${id}/return`, { reason: "[식사] 시험 되돌림 사유" });
    await seed.confirmAll(id);
    const worker = await apiAs("worker");
    await call(worker, "POST", `/api/records/${id}/submit`);
    await worker.dispose();
    await seed.resolveAll(id);
    expect((await call(manager, "POST", `/api/records/${id}/approve`)).status).toBe(200);
    await manager.dispose();

    await open(page, `/approved?id=${id}`);
    const timeline = page.getByRole("list", { name: "진행 단계" });
    await expect(timeline).toContainText("되돌");
    await expect(timeline).toContainText("시험 되돌림 사유");
    await expect(timeline).toContainText("재전송");
  });
});

test.describe("M4 어르신·작성자", () => {
  test("[#95] 작성자 2명이 담당하는 어르신은 담당 작성자 2명이 모두 보인다", async ({
    page,
    seed,
    run,
  }) => {
    const resident = await seed.resident({ workers: ["worker", "worker2"] });
    await open(page, "/residents");
    const row = page.locator("tr", { hasText: resident.alias.replace(" 어르신", "") });
    await expect(row).toContainText(run.users.worker.name);
    await expect(row).toContainText(run.users.worker2.name);
  });

  test("[#96] 어르신 [수정] 창에서 가명을 고칠 수 있다", async ({ page, seed }) => {
    const resident = await seed.resident();
    await open(page, "/residents");
    await page
      .locator("tr", { hasText: resident.alias })
      .getByRole("button", { name: "수정" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox", { name: /가명/ })).toBeVisible();
  });
});

test.describe("M5 설정", () => {
  test("[#119] 설정의 작성자 가입 코드가 이 기관의 DB 가입 코드와 같다", async ({ page, run }) => {
    await open(page, "/settings");
    await expect(page.locator(".code-box")).toContainText(run.orgs.general.workerCode);
    await expect(page.locator("body")).not.toContainText("DEMO-CARE-24");
  });
});

test.describe("교육용 기관(시험 강사)", () => {
  test.use({ storageState: authFile("trainer") });

  test("[#119·#125] 강사 설정에는 이 교육원 가입 코드와 '교육용 기관: 예'가 보인다", async ({
    page,
    run,
  }) => {
    await open(page, "/settings");
    await expect(page.locator(".code-box")).toContainText(run.orgs.training.workerCode);
    await expect(page.locator("dd").filter({ hasText: /^예/ })).toHaveCount(1);
  });

  test("[#125] 강사 화면에 '연습용'이 보이고 '관리자'·'담당자' 대신 '강사'로 나온다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident({ org: "training" });
    const id = await seed.record({
      residentId: resident.id,
      worker: "trainee",
      draft: facilityDraft(),
      submit: true,
    });
    await open(page, `/review/${id}`);
    const body = page.locator("body");
    await expect(body).toContainText("연습용");
    await expect(body).toContainText("강사");
    await expect(body).not.toContainText("관리자");
    await expect(body).not.toContainText("담당자");
  });
});
