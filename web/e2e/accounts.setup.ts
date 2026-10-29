// 준비 단계: 시험 기관·계정을 만들고, 계정마다 화면으로 한 번 로그인해 쿠키를 남긴다.
// 다른 점검(api·worker·manager)은 이 단계가 끝난 뒤에 돈다(playwright.config.ts dependencies).
import { expect, test as setup } from "@playwright/test";

import { authFile } from "./support/env";
import { ACCOUNTS, prepareRun, type Role } from "./support/run";

setup("시험 기관·계정 준비와 로그인", async ({ browser }) => {
  setup.setTimeout(240_000);
  const run = await prepareRun();

  for (const role of Object.keys(ACCOUNTS) as Role[]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator("#email").fill(run.users[role].email);
    await page.locator("#password").fill(run.users[role].password);
    await page.getByRole("button", { name: /로그인/ }).click();
    const home = ACCOUNTS[role].role === "reviewer" ? "/review" : "/today";
    await expect(page, `${role} 로그인 뒤 첫 화면`).toHaveURL(new RegExp(`${home}$`), {
      timeout: 60_000,
    });
    await context.storageState({ path: authFile(role) });
    await context.close();
  }
});
