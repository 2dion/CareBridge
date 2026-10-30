# web

케어브릿지 앱(화면 + 서버 API)입니다. Next.js(TypeScript) 하나로 작성자 폰 화면, 관리자 PC 화면, 서버 API를 같이 만듭니다.

- **목적:** 팀원 누구나 같은 명령으로 앱을 띄우고 같은 검사를 통과시키게 합니다.
- **배경:** 10/23 기능 마감까지 여러 사람이 동시에 AI 코딩 도구로 코드를 씁니다. 키가 없는 팀원도 바로 개발할 수 있어야 합니다.
- **근거:** 기술 선택 v1.1, 코디세이 API 사용 방법 v1.0, 결정 기록 `2026-10-20-개발환경.md`.
- **사유:** 기본은 Mock 모드라 키 없이 돌아가고, 키는 서버 환경 변수에만 둡니다(AGENTS.md 원칙 6).

## 처음 한 번

Node.js 22 이상이 필요합니다(`node -v`로 확인).

```bash
cd web
npm ci
cp .env.example .env.local     # 키 없이도 그대로 돌아감 (Mock)
npm run dev                    # http://localhost:3000
```

- 화면 위에 노란 **MOCK** 띠가 보이면 Mock 모드입니다. Claude·받아쓰기를 부르지 않습니다.
- http://localhost:3000/api/health 에서 설정 상태를 봅니다. 키 값은 나오지 않고 "있는지"만 나옵니다.

## 실제 AI를 부르고 싶을 때

`.env.local`을 고칩니다. 키 원문은 채팅·문서·커밋에 붙이지 않습니다.

| 변수                   | 값                                                                            |
| ---------------------- | ----------------------------------------------------------------------------- |
| `USE_MOCK_AI`          | `false`                                                                       |
| `ANTHROPIC_AUTH_TOKEN` | 코디세이 **Anthropic 호환** 키 (`ANTHROPIC_API_KEY` 아님. Bearer로 나가야 함) |
| `GROQ_API_KEY`         | Groq 키                                                                       |
| `AI_MODEL_MAIN`        | 개발은 `claude-haiku-4`, 품질 확인·시연만 `claude-sonnet-4`                   |

팀장 맥의 저장소 루트 `.env`에 있는 이름과의 대응: `CODYSSEY_ANTHROPIC_KEY` → `ANTHROPIC_AUTH_TOKEN`, `GROQ_API_KEY` → 그대로. Next.js는 `web/.env.local`만 읽으므로 이 파일에 옮겨 적습니다.

## 검사 명령

PR 전에 `npm run check`가 통과해야 합니다. GitHub Actions "web 검사"도 같은 것을 돌립니다.

| 명령                              | 하는 일                           |
| --------------------------------- | --------------------------------- |
| `npm run lint`                    | ESLint (Next.js 권장 규칙)        |
| `npm run format` / `format:check` | Prettier로 형식 고치기 / 확인     |
| `npm run typecheck`               | 경로 타입 생성 후 TypeScript 검사 |
| `npm run test`                    | Vitest (`*.test.ts`)              |
| `npm run build`                   | 배포와 같은 빌드                  |
| `npm run check`                   | 빌드 빼고 위를 모두               |

## 폴더

| 위치            | 넣는 것                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `app/`          | 화면(page.tsx)과 서버 API(`app/api/**/route.ts`). API 경로는 데이터 구조 v1.1 '공통 계약'을 그대로 따름 |
| `components/`   | 여러 화면이 같이 쓰는 화면 조각                                                                         |
| `lib/config.ts` | 환경 변수 읽기, Mock 판정, 모델 이름(설정 한 곳)                                                        |
| `lib/ai/`       | Claude(코디세이) 호출. 서버 전용                                                                        |
| `lib/stt/`      | 받아쓰기(Groq) 호출. 서버 전용                                                                          |
| `lib/supabase/` | Supabase 클라이언트 (`server.ts` 서버용, `client.ts` 브라우저용)                                        |

- `lib/ai`, `lib/stt`, `lib/supabase/server.ts`는 맨 위에 `import "server-only"`가 있어, 브라우저 코드에서 부르면 빌드가 깨집니다. 키가 새는 것을 막는 장치이니 지우지 않습니다.
- 지금은 뼈대만 있습니다. 화면(W0~W6, M1~M4), API, Agent 반복, Mock 응답 내용은 각 담당이 채웁니다.

## Vercel 연결

Vercel 프로젝트 설정에서 **Root Directory = `web`**, **Framework Preset = Next.js**로 둡니다. 환경 변수는 위 표와 `.env.example`의 이름 그대로 넣고, Production은 `USE_MOCK_AI=false`여야 합니다(아니면 `/api/health`가 문제로 알림). 녹음 정리용 `CRON_SECRET`은 Vercel과 GitHub 저장소 Secrets에 같은 값으로 둡니다(`.github/workflows/audio-cleanup.yml`, 10/28).

자동 배포는 main 브랜치만 합니다(`vercel.json`의 `git.deploymentEnabled`, 10/31 다시 켬). 다른 브랜치에 올려도 미리보기 배포가 생기지 않으니, 합치기 전 확인은 로컬과 GitHub Actions "web 검사"로 합니다. 오래된 작업 브랜치는 최신 main을 합쳐 이 설정도 맞춥니다.

미리보기가 꼭 필요하면 Vercel 대시보드 **Deployments → Create Deployment**에서 해당 작업 브랜치를 지정해 수동 배포합니다. 기존 배포의 Redeploy와 최신 main 배포는 구분합니다.

**Pause Project**는 운영 사이트의 서비스를 멈추는 별도 설정입니다. 자동 배포 중단과 다르며, 사이트를 다시 열 때는 **Settings → General → Resume Project**를 선택합니다. 자동 배포 설정을 바꿨다고 Pause를 해제하거나 수동 배포하지 않습니다.

- [Vercel Git 자동 배포 설정](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments)
- [Git 참조로 수동 배포](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference)
