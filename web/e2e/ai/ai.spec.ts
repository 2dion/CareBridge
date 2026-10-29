// 실제 AI(Claude) 점검. `E2E_AI=1`일 때만 돈다(코디세이 토큰을 쓰고 30분 넘게 걸림).
// 서버를 USE_MOCK_AI=false로 띄우고(playwright.config.ts), [글로 쓰기]와 같은 API로 초안을 만든다.
// AI 답은 매번 조금씩 달라서, '반드시 지켜야 하는 것'(지어내기 0, 섭취량 값 형식 등)만 실패로 보고
// 나머지 숫자는 e2e/.state/ai-quality.md에 남겨 AI 규칙 '품질 확인 방법' 표를 채우는 데 쓴다.
import fs from "node:fs";
import path from "node:path";

import { STATE_DIR, WEB_DIR } from "../support/env";
import { apiAs, call, expect, type Seed, test } from "../support/fixtures";

type CaseItem = { item_key: string; status: string; value_ko: string };
type Case = {
  case_id: string;
  care_type: "facility" | "home";
  language_type: string;
  transcript: string;
  draft: { items: CaseItem[] };
};

const CASES_DIR = path.join(WEB_DIR, "..", "data", "cases");
const cases: Case[] = fs
  .readdirSync(CASES_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(fs.readFileSync(path.join(CASES_DIR, name), "utf8")) as Case);

const REPORT = path.join(STATE_DIR, "ai-quality.md");
const QUESTION_WORDS = /확인 필요|용어 확인|불명확|확인해 주세요|\?/;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(
    REPORT,
    `# AI 품질 측정 (${new Date().toISOString()})\n\n| 사례 | 상태 일치 | 지어냄 | 확인 필요 | 시간(초) | 끝난 이유 |\n| --- | --- | --- | --- | --- | --- |\n`,
  );
});

/** [글로 쓰기]와 같은 길: 기록 만들기 → POST agent-run { text } */
async function draftFromText(seed: Seed, careType: "facility" | "home", text: string) {
  const resident = await seed.resident({ careType, visitDays: [1, 2, 3, 4, 5, 6, 7] });
  const id = await seed.record({ residentId: resident.id });
  const api = await apiAs("worker");
  const started = Date.now();
  const result = await call(api, "POST", `/api/records/${id}/agent-run`, { text });
  await api.dispose();
  return { id, result, seconds: Math.round((Date.now() - started) / 1000) };
}

test.describe("[계획 AI 품질] 합성 사례 10개", () => {
  for (const sample of cases) {
    test(`${sample.case_id} (${sample.care_type}, ${sample.language_type}): 지어낸 항목이 없다`, async ({
      seed,
    }) => {
      const { id, result, seconds } = await draftFromText(
        seed,
        sample.care_type,
        sample.transcript,
      );
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      const items = await seed.items(id);
      const answer = new Map(sample.draft.items.map((item) => [item.item_key, item.status]));
      const same = items.filter((item) => answer.get(item.item_key) === item.status).length;
      // 정답이 '언급 없음'인데 내용을 채워 '관찰'로 둔 항목 = 지어냄(목표 0)
      const invented = items.filter(
        (item) =>
          answer.get(item.item_key) === "not_mentioned" &&
          item.status === "observed" &&
          item.value_ko.trim() !== "",
      );
      const needsCheck = items.filter((item) => item.status === "needs_check").length;
      fs.appendFileSync(
        REPORT,
        `| ${sample.case_id} | ${same}/9 | ${invented.map((item) => item.item_key).join(", ") || "0"} | ${needsCheck} | ${seconds} | ${String(result.body.end_reason ?? "")} |\n`,
      );
      expect(
        invented.map((item) => item.item_key),
        "지어낸 항목",
      ).toEqual([]);
      for (const item of items) {
        expect(item.value_ko, `${item.item_key} 내용에 확인 요청 문장(#117)`).not.toMatch(
          QUESTION_WORDS,
        );
      }
    });
  }
});

test.describe("이슈 재현 문장", () => {
  const HOME_TEXT =
    "2시부터 5시까지 방문했어요. 목욕 도와드리고 80분, 청소랑 빨래 60분, 말벗 60분 했어요. 간식으로 죽 반 그릇 드셨어요. 화장실에 한 번 모시고 가서 실수는 없었어요. 오늘 날짜를 두 번 물어보셨어요.";

  test("[#115·#117·#121] 재가 문장: 방문 시간·분이 채워지고, 확인 요청 문장이 없고, '확인 필요'가 적다", async ({
    seed,
  }) => {
    const { id, result } = await draftFromText(seed, "home", HOME_TEXT);
    expect(result.status).toBe(200);
    const row = await seed.recordRow(id);
    const items = await seed.items(id);
    const support = items.find((item) => item.item_key === "support")!;
    expect(String(row.visit_start ?? "")).toMatch(/^14:00/);
    expect(String(row.visit_end ?? "")).toMatch(/^17:00/);
    expect(support.detail.minutes).toMatchObject({ physical: 80, housework: 60, emotional: 60 });
    expect(support.value_ko).toMatch(/청소|빨래|세탁/);
    for (const item of items) expect(item.value_ko, item.item_key).not.toMatch(QUESTION_WORDS);
    expect(items.filter((item) => item.status === "needs_check").length).toBeLessThanOrEqual(2);
  });

  test("[#121] 베트남어 시설 문장: 수면·식사 같은 기본 항목이 '관찰'로 정리되고 번역에 성별이 없다", async ({
    seed,
  }) => {
    const { id, result } = await draftFromText(
      seed,
      "facility",
      "Buổi sáng tôi giúp ông ấy rửa mặt. Bữa trưa ăn hết cơm. Ban đêm ngủ ngon, không thức dậy.",
    );
    expect(result.status).toBe(200);
    const items = await seed.items(id);
    expect(items.find((item) => item.item_key === "sleep")!.status).toBe("observed");
    for (const item of items) expect(item.value_ko, item.item_key).toMatch(/^$|[가-힣]/);
  });

  test("[#118·#121] 베트남어로 고친 항목은 한국어 기록체로 정리되고 번역은 베트남어다", async ({
    seed,
  }) => {
    const { id } = await draftFromText(seed, "facility", "점심은 조금 드셨어요. 약은 드셨어요.");
    const api = await apiAs("worker");
    const fixed = await call(api, "POST", `/api/records/${id}/items/meal`, {
      text: "Bà ăn hết nửa bát cháo.",
    });
    await api.dispose();
    expect(fixed.status, JSON.stringify(fixed.body)).toBe(200);
    const meal = (await seed.items(id)).find((item) => item.item_key === "meal")!;
    expect(meal.value_ko).toMatch(/[가-힣]/);
    expect(meal.value_ko).not.toMatch(/요\.?$/);
    const { data } = await seed.admin
      .from("record_items")
      .select("value_native")
      .eq("record_id", id)
      .eq("item_key", "meal")
      .single();
    expect(data?.value_native).toMatch(/[ăâđêôơưáàảãạ]/i);
    expect(data?.value_native).not.toMatch(/\bcô ấy\b/i);
  });

  test("[#122] 도우미: 베트남어 교재 질문에도 교재 출처가 붙는다", async () => {
    const api = await apiAs("worker");
    const answer = await call(api, "POST", "/api/helper/ask", {
      question: "Hỗ trợ hoạt động thể chất là gì?",
    });
    await api.dispose();
    expect(answer.status).toBe(200);
    expect(answer.body.found).toBe(true);
    expect(answer.body.source).toBeTruthy();
  });

  test("[#122] 도우미: 베트남어 건강·안전 질문에도 '관리자에게 바로 보고하세요' 안내가 붙는다", async () => {
    const api = await apiAs("worker");
    const answer = await call(api, "POST", "/api/helper/ask", {
      question: "Bà bị ngã trong phòng tắm, tôi nên làm gì?",
    });
    await api.dispose();
    expect(answer.status).toBe(200);
    expect(String(answer.body.ko)).toContain("관리자에게 바로 보고");
  });
});
