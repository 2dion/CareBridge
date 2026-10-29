// 작성자 화면(W) 점검. 휴대폰 크기, 시험 작성자 계정으로 로그인한 상태에서 돈다.
// [계획 …]은 테스트 계획 줄, [#번호]는 이슈. 안 고친 이슈는 실패하는 것이 정상이다.
import type { Page } from "@playwright/test";

import { authFile, BASE_URL } from "../support/env";
import { apiAs, call, expect, kstDate, open, type Seed, test } from "../support/fixtures";
import { facilityDraft, homeDraft, withItem } from "../support/drafts";

/** W3에서 [맞아요]·[없음이 맞아요]를 하나씩 눌러 9개를 모두 확인한다 */
async function confirmAllOnScreen(page: Page) {
  const buttons = page.getByRole("button", { name: /맞아요/ });
  for (let left = await buttons.count(); left > 0; left = await buttons.count()) {
    await buttons.first().click();
    await expect(buttons).toHaveCount(left - 1);
  }
}

test.describe("기록 쓰기 흐름", () => {
  test("[계획 흐름] 초안의 9개 항목을 확인하고 관리자에게 전송하면 전송 완료가 된다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft() });
    await open(page, `/records/${id}`);
    const send = page.getByRole("button", { name: /관리자에게 전송/ });
    await expect(send).toBeDisabled();
    await confirmAllOnScreen(page);
    await expect(send).toBeEnabled();
    await send.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("전송한 뒤에는 고칠 수 없어요.");
    await dialog.getByRole("button", { name: /^전송/ }).click();
    await expect(page).toHaveURL(new RegExp(`/records/${id}/sent`));
    expect((await seed.recordRow(id)).status).toBe("submitted");
  });

  test("[계획 작성전-5] 같은 날 기록이 이미 있으면 새로 만들지 않고 그 기록을 연다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft() });
    await open(page, `/start/${resident.id}`);
    await page.getByText("글로 쓰기").click();
    await expect(page).toHaveURL(new RegExp(`/records/${id}`));
    const { data } = await seed.admin.from("records").select("id").eq("resident_id", resident.id);
    expect(data).toHaveLength(1);
  });
});

test.describe("역할별 화면 막기", () => {
  test("[#114] 작성자가 관리자 화면 주소를 열면 오늘 화면으로 돌아간다", async ({ page }) => {
    for (const url of ["/review", "/approved", "/residents", "/settings"]) {
      await page.goto(url);
      await expect(page, url).toHaveURL(/\/today$/);
    }
  });

  test("[#97] 실제 모드 첫 화면에 Mock 입구 버튼·문구가 한 번도 보이지 않는다", async ({
    browser,
  }) => {
    for (const storageState of [authFile("worker"), undefined]) {
      const context = await browser.newContext({ storageState, baseURL: BASE_URL });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const seen = () =>
          /Mock 시연|작성자로 시작|관리자로 시작/.test(document.body?.innerText ?? "");
        const w = window as unknown as { __mockSeen?: boolean };
        new MutationObserver(() => {
          if (seen()) w.__mockSeen = true;
        }).observe(document, { childList: true, subtree: true, characterData: true });
      });
      await page.goto("/");
      await page.waitForTimeout(3000);
      const seen = await page.evaluate(
        () => (window as unknown as { __mockSeen?: boolean }).__mockSeen ?? false,
      );
      expect(seen, storageState ? "로그인한 상태" : "로그인 안 한 상태").toBe(false);
      await context.close();
    }
  });
});

test.describe("W3 기록 초안 확인", () => {
  test("[#135] 글로 쓴 기록의 '정리 중' 화면에 '음성을 글자로 바꾸는' 단계가 없다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id });
    // 초안 만들기 요청을 8초 붙잡아 '정리 중' 화면을 본다(시험 서버는 AI를 부르지 않음)
    await page.route(`**/api/records/${id}/agent-run`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      await route.continue();
    });
    await open(page, `/records/${id}/write`);
    await page.locator("#care-text").fill("점심을 반 그릇 드셨어요. 낮잠을 한 시간 주무셨어요.");
    await page.getByRole("button", { name: /초안 만들기/ }).click();
    await expect(page.getByText("내용을 항목별로 정리하고 있어요.")).toBeVisible();
    await expect(page.getByText("음성을 글자로 바꾸고 있어요.")).toHaveCount(0);
  });

  test("[#135] 글로 쓴 기록에서 [글로 쓰기]를 다시 열면 쓴 글이 채워져 있다(녹음 기록은 비어 있다)", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const textId = await seed.record({ residentId: resident.id, draft: facilityDraft() });
    await open(page, `/records/${textId}/write`);
    await expect(page.locator("#care-text")).toHaveValue(facilityDraft().transcript_ko);

    const other = await seed.resident();
    const voiceId = await seed.record({
      residentId: other.id,
      draft: facilityDraft(),
      voice: true,
    });
    await open(page, `/records/${voiceId}/write`);
    await expect(page.locator("#care-text")).toHaveValue("");
  });

  test("[#137] 9개를 모두 확인한 뒤 위쪽 띠에 '확인했어요'와 '확인 필요'가 같이 나오지 않는다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({
      residentId: resident.id,
      draft: facilityDraft(),
      confirmAll: true,
    });
    await open(page, `/records/${id}`);
    const bar = page.locator(".done-bar");
    await expect(bar).toBeVisible();
    const text = await bar.innerText();
    expect(/확인했어요/.test(text) && /확인 필요/.test(text), text).toBe(false);
  });

  test("[#141] 내용이 빈 '확인 필요' 항목을 열면 'AI가 정리한 내용' 칸이 비어 있지 않고 안내가 보인다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const draft = withItem(facilityDraft(), "sleep", {
      status: "needs_check",
      value_ko: "",
      value_native: "",
      reason: "간접 전달이라 직접 확인이 필요함",
    });
    const id = await seed.record({ residentId: resident.id, draft });
    await open(page, `/records/${id}/items/sleep`);
    const card = page.locator("section.review.card").filter({ hasText: "AI가 정리한 내용" });
    await expect(card).toBeVisible();
    const body = (await card.innerText()).replace("AI가 정리한 내용", "").trim();
    expect(body, "빈 칸 대신 안내 문구").not.toBe("");
  });
});

test.describe("W3 재가 서식 칸", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function homeRecord(seed: Seed) {
    const resident = await seed.resident({ careType: "home", visitDays: [1, 2, 3, 4, 5, 6, 7] });
    return seed.record({
      residentId: resident.id,
      draft: homeDraft(),
      visit: { start: "14:00", end: "17:00" },
    });
  }

  test("[#139] 방문 시작·종료 시간 칸이 '오후 02:00'을 다 보일 만큼(130px 이상) 넓다(휴대폰 375px)", async ({
    page,
    seed,
  }) => {
    const id = await homeRecord(seed);
    await open(page, `/records/${id}/items/visit_time`);
    for (const selector of ["#visit-start", "#visit-end"]) {
      const input = page.locator(selector);
      await expect(input).toHaveValue(/^1[47]:00$/);
      const box = await input.boundingBox();
      expect(box!.width, `${selector} 폭(px)`).toBeGreaterThanOrEqual(130);
    }
  });

  test("[#139] 지원별 분 칸 6개와 실수 횟수 칸 2개가 이름과 함께 읽힌다", async ({
    page,
    seed,
  }) => {
    const id = await homeRecord(seed);
    await open(page, `/records/${id}/items/support`);
    for (const name of [
      "신체활동지원",
      "인지자극활동",
      "일상생활 함께하기",
      "인지관리지원",
      "정서지원",
      "가사 및 일상생활지원",
    ]) {
      await expect(page.getByRole("spinbutton", { name: new RegExp(name) })).toHaveCount(1);
    }
    await open(page, `/records/${id}`);
    for (const name of ["대변 실수 횟수", "소변 실수 횟수"]) {
      await expect(page.getByRole("spinbutton", { name })).toHaveCount(1);
    }
  });

  test("[#139] 대변 실수 횟수에 0을 넣고 바로 다른 칸을 눌러도 0이 남는다", async ({
    page,
    seed,
  }) => {
    const id = await homeRecord(seed);
    await open(page, `/records/${id}`);
    const stool = page.locator(".minutes-grid input").first();
    await stool.fill("0");
    await page.locator(".minutes-grid input").nth(1).click();
    await page.waitForTimeout(3000);
    await expect(stool).toHaveValue("0");
    const row = await seed.recordRow(id);
    expect((row.form_fields as Record<string, unknown>).stool_accidents).toBe(0);
  });
});

test.describe("W4 기록", () => {
  test("[#98] 승인한 기록 보기에는 '확인 필요' 배지 대신 관리자가 정한 결과가 보인다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident();
    const id = await seed.record({ residentId: resident.id, draft: facilityDraft(), submit: true });
    await seed.resolveAll(id);
    const manager = await apiAs("manager");
    expect((await call(manager, "POST", `/api/records/${id}/approve`)).status).toBe(200);
    await manager.dispose();

    await open(page, `/records/${id}/view`);
    await expect(page.getByText("승인 완료").first()).toBeVisible();
    await expect(page.locator(".view-item .badge", { hasText: "확인 필요" })).toHaveCount(0);
    await expect(page.locator(".view-item", { hasText: "식사" })).toContainText("확인함");
  });

  test.describe("기간 거르기(시험 작성자 나)", () => {
    test.use({ storageState: authFile("worker2") });

    async function pickDate(page: Page, date: string) {
      const [, m, d] = date.split("-").map(Number);
      const label = `${m}월 ${d}일`;
      for (
        let i = 0;
        i < 2 && (await page.getByRole("button", { name: label, exact: true }).count()) === 0;
        i += 1
      ) {
        await page.getByRole("button", { name: "이전 달" }).click();
      }
      await page.getByRole("button", { name: label, exact: true }).click();
    }

    const heads = (page: Page) => page.locator(".group-head");

    test("[계획 기록기간-1·2] 시작일·끝일을 고르면 그 기간 기록만, 한 번만 누르면 그 하루만 보인다", async ({
      page,
      seed,
    }) => {
      const resident = await seed.resident({ workers: ["worker2"] });
      for (const days of [1, 3, 5]) {
        await seed.record({
          residentId: resident.id,
          worker: "worker2",
          careDate: kstDate(days),
          draft: facilityDraft(),
        });
      }
      await open(page, "/archive");
      await page.getByRole("button", { name: "날짜로 거르기" }).click();
      await pickDate(page, kstDate(3));
      await pickDate(page, kstDate(1));
      await page.getByRole("button", { name: /기록 보기/ }).click();
      const shown = await heads(page).allInnerTexts();
      expect(shown.length).toBeGreaterThan(0);
      const [, m5, d5] = kstDate(5).split("-").map(Number);
      expect(shown.join(" ")).not.toContain(`${m5}월 ${d5}일`);
      // 최신 날짜가 위
      const [, m1, d1] = kstDate(1).split("-").map(Number);
      expect(shown[0]).toContain(`${m1}월 ${d1}일`);

      await page.getByRole("button", { name: "기간 거르기 지우기" }).click();
      await page.getByRole("button", { name: "날짜로 거르기" }).click();
      await pickDate(page, kstDate(3));
      await page.getByRole("button", { name: /기록 보기/ }).click();
      await expect(heads(page)).toHaveCount(1);
    });

    test("[계획 기록기간-3] 오늘 뒤 날짜는 고를 수 없다", async ({ page }) => {
      await open(page, "/archive");
      await page.getByRole("button", { name: "날짜로 거르기" }).click();
      const [, m, d] = kstDate(-1).split("-").map(Number);
      const tomorrow = page.getByRole("button", { name: `${m}월 ${d}일`, exact: true });
      if ((await tomorrow.count()) === 0) {
        // 오늘이 그달 마지막 날이면 다음 달로 넘어가는 버튼부터 막혀 있다
        await expect(page.getByRole("button", { name: "다음 달" })).toBeDisabled();
      } else {
        await expect(tomorrow).toBeDisabled();
      }
    });
  });
});

test.describe("W5 내 정보", () => {
  test("[#138] 내 정보에 로그인한 이메일이 보인다", async ({ page, run }) => {
    await open(page, "/me");
    await expect(page.getByText(run.users.worker.email)).toBeVisible();
  });

  test.describe("글자 크기(시험 작성자 다)", () => {
    test.use({ storageState: authFile("worker3") });
    test.describe.configure({ mode: "serial" });

    test("[#138] 가장 큰 글씨에서도 [적용] 버튼이 내리지 않고 보인다", async ({
      page,
      seed,
      run,
    }) => {
      await seed.admin.from("profiles").update({ font_size: 3 }).eq("id", run.users.worker3.id);
      await open(page, "/me/font");
      await page.getByRole("radio", { name: /크게/ }).click();
      const apply = page.getByRole("button", { name: /적용/ });
      const box = await apply.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.y + box!.height, "버튼 아래 끝(px)").toBeLessThanOrEqual(viewport.height);
      await seed.admin.from("profiles").update({ font_size: 2 }).eq("id", run.users.worker3.id);
    });

    test("[#108] 글자 크기를 바꾸고 로그아웃·다시 로그인해도 유지된다", async ({
      browser,
      run,
      seed,
    }) => {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();
      const login = async () => {
        await page.goto("/login");
        await page.locator("#email").fill(run.users.worker3.email);
        await page.locator("#password").fill(run.users.worker3.password);
        await page.getByRole("button", { name: /로그인/ }).click();
        await expect(page).toHaveURL(/\/today$/);
      };
      await login();
      await open(page, "/me/font");
      await page.getByRole("radio", { name: /작게/ }).click();
      await page.getByRole("button", { name: /적용/ }).click();
      await expect(page).toHaveURL(/\/me$/);
      await page.getByRole("button", { name: /로그아웃/ }).click();
      await expect(page).toHaveURL(/\/login$/);
      await login();
      await open(page, "/me/font");
      await expect(page.getByRole("radio", { name: /작게/ })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await context.close();
      await seed.admin.from("profiles").update({ font_size: 2 }).eq("id", run.users.worker3.id);
    });
  });
});

test.describe("교육용 기관(시험 교육생)", () => {
  test.use({ storageState: authFile("trainee") });

  test("[#125] 교육생 화면에 '연습용'이 보이고 '관리자'·'담당자' 대신 '강사'로 나온다", async ({
    page,
    seed,
  }) => {
    const resident = await seed.resident({ org: "training" });
    const id = await seed.record({
      residentId: resident.id,
      worker: "trainee",
      draft: facilityDraft(),
    });
    await open(page, `/records/${id}`);
    const body = page.locator("body");
    await expect(body).toContainText("연습용");
    await expect(body).toContainText("강사");
    await expect(body).not.toContainText("관리자");
    await expect(body).not.toContainText("담당자");
  });
});
