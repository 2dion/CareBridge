"use client";

import { useState } from "react";

import { createActionLock } from "@/lib/action-lock";

/** W3 요청이 끝날 때까지 버튼 상태와 동기식 클릭 잠금을 함께 유지한다. */
export function useActionLock() {
  const [pending, setPending] = useState<string | null>(null);
  const [lock] = useState(() => createActionLock(setPending));
  return { pending, run: lock.run };
}
