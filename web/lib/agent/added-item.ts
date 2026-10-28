// ③ 항목 보태기: W3에서 작성자가 한 항목을 다시 말했을 때, Claude 한 번 호출로 그 항목 1행만 다시 쓴다.
// 근거: 문서/설계/ai규칙-v1.1.1.md 'AI가 하는 일' ③·'쓰기 원칙'·'서버 검사와 예외 처리', 결정 2026-10-28-항목하나저장
// 결과는 기존 validateDraft로 검사한다(근거가 원문·새로 말한 글에 있는지, 실명, 재가 분 합 등).

import {
  ITEM_KEYS,
  validateDraft,
  type DraftItem,
  type ItemKey,
  type ValidateContext,
} from "./validate-draft";

export function addItemSystemPrompt(itemKey: ItemKey, nativeLang: "ko" | "vi") {
  return `너는 요양 돌봄 기록의 항목 하나를 다시 쓴다. 결과는 초안이며 작성자가 확인한다.
[항목] ${itemKey}
[작성자 모국어] ${nativeLang}

규칙:
1. 작성자가 새로 말한 글에 없는 내용은 쓰지 않는다. 없으면 status=not_mentioned, value_ko="".
2. evidence에는 새로 말한 글의 문장을 한 글자도 바꾸지 않고 옮긴다.
3. 양·정도가 모호하거나, 사투리를 짐작했거나, 말이 서로 맞지 않거나,
   낙상·상처·호흡·의식·통증·복약 이상이 있으면 status=needs_check이고 reason을 쓴다.
4. 진단하지 말고 본 것만 쓴다. value_ko는 한국어 기록체(~하심, ~드심).
   value_native는 그 번역, reason을 쓰면 reason_native에 그 번역을 쓴다.
5. 어르신·가족의 실명을 쓰지 않는다.
6. 다른 말 없이 JSON 한 개로만 답한다:
{"value_ko":"","value_native":"","status":"observed|not_mentioned|needs_check","evidence":"","reason":"","reason_native":"","detail":{}}`;
}

export function addItemUserMessage(current: DraftItem, utterance: string) {
  return `[지금 항목]\n${JSON.stringify(current)}\n\n[작성자가 새로 말한 글]\n${utterance}`;
}

/** Claude 답에서 JSON 한 개를 꺼낸다. 형식이 틀리면 null */
export function parseAddedItem(raw: string, itemKey: ItemKey): DraftItem | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const text = (key: string) => (typeof parsed[key] === "string" ? (parsed[key] as string) : "");
    const detail = parsed.detail;
    return {
      item_key: itemKey,
      value_ko: text("value_ko"),
      value_native: text("value_native"),
      status: text("status") as DraftItem["status"],
      evidence: text("evidence"),
      reason: text("reason"),
      reason_native: text("reason_native"),
      detail:
        detail && typeof detail === "object" && !Array.isArray(detail)
          ? (detail as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

/**
 * 9개 초안에 새 항목을 넣어 서버 검사를 돌리고, 고친 그 항목만 돌려준다.
 * 근거 대조 원문은 기록 원문 + 새로 말한 글. 형식이 깨졌으면 null.
 */
export function checkAddedItem(
  item: DraftItem,
  currentItems: DraftItem[],
  context: ValidateContext,
  utterance: string,
  formFields: Record<string, unknown>,
): DraftItem | null {
  const items = ITEM_KEYS.map(
    (key) => (key === item.item_key ? item : currentItems.find((i) => i.item_key === key))!,
  );
  if (items.some((entry) => !entry)) return null;
  const result = validateDraft(
    { transcript_ko: "", items, form_fields: formFields },
    { ...context, transcript: `${context.transcript}\n${utterance}` },
  );
  return result.fixed?.items.find((entry) => entry.item_key === item.item_key) ?? null;
}
