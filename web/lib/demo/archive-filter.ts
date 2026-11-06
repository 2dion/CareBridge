// W4(기록) 어르신 고르기(이슈 #326 A안). 화면에서 거르기만 하고 새 API·상태 값은 없다.
// 고를 수 있는 어르신은 작성자가 읽을 수 있는 어르신(RLS)뿐이다. 남의 기록은 원래 읽히지 않는다.

/** 주소의 resident 값이 고를 수 있는 어르신이면 그 id, 아니면 '전체'(null) */
export function pickedResident(
  residents: readonly { id: string }[],
  param: string | null,
): string | null {
  return param && residents.some((resident) => resident.id === param) ? param : null;
}

/** 고른 어르신(null이면 전체)에 맞는 줄만 남긴다 */
export function forResident<T extends { residentId: string }>(
  rows: readonly T[],
  residentId: string | null,
): T[] {
  return residentId === null ? [...rows] : rows.filter((row) => row.residentId === residentId);
}

/** 상태 탭과 고른 어르신을 함께 남긴 W4 주소. 상세에서 돌아와도 같은 거르기로 열린다 */
export function archiveHref(tab: string, residentId: string | null): string {
  const params = new URLSearchParams({ tab });
  if (residentId) params.set("resident", residentId);
  return `/archive?${params.toString()}`;
}
