import { displayOrder, type RecordItem } from "@/lib/demo/store";

/** #101 승인본 화면만: 다음 확인사항 → 확인 필요 상태 → 나머지. 인쇄는 건드리지 않는다. */
export function recordViewItems(items: RecordItem[], approved: boolean) {
  const base = [...items].sort(
    (a, b) => displayOrder.indexOf(a.item_key) - displayOrder.indexOf(b.item_key),
  );
  if (!approved) return { visible: base, missing: [] as RecordItem[] };
  const missing = base.filter((item) => item.status === "not_mentioned" && !item.value_ko.trim());
  const missingKeys = new Set(missing.map((item) => item.item_key));
  const rank = (item: RecordItem) =>
    item.item_key === "next_check" ? 0 : item.status === "needs_check" ? 1 : 2;
  return {
    visible: base
      .filter((item) => !missingKeys.has(item.item_key))
      .sort((a, b) => rank(a) - rank(b)),
    missing,
  };
}
