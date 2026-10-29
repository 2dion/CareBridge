"use client";

// 글을 넣는 칸(A1·A2·W2·W3·W6 공용). 한글 조합(IME) 중에는 바깥 값으로 칸을 덮어쓰지 않아
// 한/영 변환키 등으로 조합을 끝낼 때 글자가 두 번 들어가지 않는다(이슈 #107, lib/ime.ts).
// value·onValueChange만 다르고 나머지 속성은 input·textarea 그대로 넘긴다.
import { type ComponentProps, useRef, useState } from "react";

import { COMPOSE_IDLE, type ComposeEvent, type ComposeState, composeStep } from "@/lib/ime";

type Controlled = {
  value: string;
  /** 조합이 아닌 입력은 바로, 조합 중인 글자는 조합이 끝났을 때 한 번 알린다 */
  onValueChange: (value: string) => void;
};

function useCompose(onValueChange: (value: string) => void) {
  const state = useRef<ComposeState>(COMPOSE_IDLE);
  const [draft, setDraft] = useState<string | null>(null);
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
  const { draft, step } = useCompose(onValueChange);
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
  const { draft, step } = useCompose(onValueChange);
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
