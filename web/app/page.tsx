// 빈 자리. 화면 W0~W6(작성자), R1~R4(담당자)는 문서/설계/화면-v1.1.md를 보고 FE가 채운다.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold">케어브릿지</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        개발 환경 준비됨. 설정 상태는{" "}
        <a className="underline" href="/api/health">
          /api/health
        </a>
        에서 확인합니다.
      </p>
    </main>
  );
}
