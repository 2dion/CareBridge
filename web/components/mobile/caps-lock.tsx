"use client";

// 비밀번호 칸의 Caps Lock 안내(A1·A2, 이슈 #109). 키를 누르거나 뗄 때 getModifierState("CapsLock")로 상태를 읽어,
// 켜져 있으면 칸 아래에 한 줄 안내(한국어 위·베트남어 아래)를 보인다. 칸을 떠나면 안내를 감춘다.
// 비밀번호 TextInput은 그대로 두고 props만 넘긴다.
import { type KeyboardEvent, useState } from "react";

export function useCapsLock() {
  const [on, setOn] = useState(false);
  const read = (event: KeyboardEvent<HTMLInputElement>) =>
    setOn(event.getModifierState("CapsLock"));
  return {
    on,
    /** 비밀번호 TextInput에 그대로 펼쳐 넣는다 */
    props: { onKeyDown: read, onKeyUp: read, onBlur: () => setOn(false) },
  };
}

export function CapsLockNote({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <small className="hint-line caps-note" role="status">
      Caps Lock이 켜져 있어요 · <span className="vi">Caps Lock đang bật</span>
    </small>
  );
}
