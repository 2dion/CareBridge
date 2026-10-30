/** React가 다음 화면을 그리기 전의 연속 클릭도 한 번만 처리한다. */
export function createActionLock(onChange: (name: string | null) => void) {
  let active: string | null = null;
  return {
    async run(name: string, action: () => Promise<void>) {
      if (active !== null) return;
      active = name;
      onChange(active);
      try {
        await action();
      } finally {
        active = null;
        onChange(null);
      }
    },
  };
}
