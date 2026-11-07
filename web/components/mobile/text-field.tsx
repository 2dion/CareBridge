"use client";

// 글을 넣는 칸(A1·A2·W2·W3·W6, M1·M2·M4 공용). 한글 조합(IME) 중에는 바깥 값으로 칸을 덮어쓰지 않아
// 한/영 변환키 등으로 조합을 끝낼 때 글자가 두 번 들어가지 않는다(이슈 #107, lib/ime.ts).
// 조합 중 입력도 바로 바깥에 알려, 조합이 끝나기 전에 버튼을 눌러도 마지막 글자가 남는다(이슈 #184).
// value·onValueChange만 다르고 나머지 속성은 input·textarea 그대로 넘긴다.
import { type ComponentProps, useEffect, useRef, useState } from "react";

import {
  COMPOSE_IDLE,
  type ComposeEvent,
  type ComposeState,
  composeOutside,
  composeStep,
} from "@/lib/ime";

type Controlled = {
  value: string;
  /** 입력마다 알린다. 조합 중에도 알리지만 칸은 조합 중인 값을 그대로 보인다 */
  onValueChange: (value: string) => void;
};

function useCompose(value: string, onValueChange: (value: string) => void) {
  const state = useRef<ComposeState>(COMPOSE_IDLE);
  const [draft, setDraft] = useState<string | null>(null);
  // 조합 중 바깥이 칸을 비우면(보낸 뒤 비우기) 조합 중이던 글을 버린다
  useEffect(() => {
    const next = composeOutside(state.current, value);
    if (next === state.current) return;
    state.current = next;
    setDraft(next.draft);
  }, [value]);
  const step = (event: ComposeEvent, value: string) => {
    const next = composeStep(state.current, event, value);
    state.current = next.state;
    setDraft(next.state.draft);
    if (next.commit !== null) onValueChange(next.commit);
  };
  return { draft, step };
}

export function TextInput({
  value,
  onValueChange,
  ...rest
}: Omit<ComponentProps<"input">, "value" | "onChange"> & Controlled) {
  const { draft, step } = useCompose(value, onValueChange);
  return (
    <input
      {...rest}
      value={draft ?? value}
      onChange={(event) => step("input", event.target.value)}
      onCompositionStart={(event) => step("start", event.currentTarget.value)}
      onCompositionEnd={(event) => step("end", event.currentTarget.value)}
    />
  );
}

export function TextArea({
  value,
  onValueChange,
  ...rest
}: Omit<ComponentProps<"textarea">, "value" | "onChange"> & Controlled) {
  const { draft, step } = useCompose(value, onValueChange);
  return (
    <textarea
      {...rest}
      value={draft ?? value}
      onChange={(event) => step("input", event.target.value)}
      onCompositionStart={(event) => step("start", event.currentTarget.value)}
      onCompositionEnd={(event) => step("end", event.currentTarget.value)}
    />
  );
}
