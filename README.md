# CareBridge

외국인 돌봄 인력이 모국어 AI 버디와 대화하면 한국어 돌봄 기록이 완성되는 앱입니다.

## 개발 시작하기

**왜:** 처음 온 팀원·심사위원이 어디서 무엇을 보면 되는지 한 곳에서 찾게 합니다. 자세한 내용은 링크한 문서에만 두고, 여기에는 안내만 씁니다.

```bash
cd web
npm ci
cp .env.example .env.local   # 키 없이도 Mock 모드로 돌아감
npm run dev                  # http://localhost:3000
```

Node.js 22 이상이 필요합니다. 키 넣는 법, 검사 명령, 폴더 구조는 [web/README.md](web/README.md)에 있습니다. AI 코딩 도구로 작업한다면 먼저 [AGENTS.md](AGENTS.md)를 읽습니다. 작업은 브랜치 → PR로 올리고(남은 문제와 큰 일은 GitHub 이슈 먼저, 기준은 AGENTS.md), PR 본문에 무엇을 바꿨나·어떻게 확인했나·남은 것 세 제목을 씁니다(AGENTS.md '작업 올리는 방법').

배포 주소(Vercel Production): https://care-bridge-kappa.vercel.app

## 기술 구성

| 부분 | 쓰는 것 | 자세히 |
| --- | --- | --- |
| 화면 + 서버 | Next.js 16 (TypeScript), Tailwind CSS | [web/README.md](web/README.md) |
| 배포 | Vercel (Root Directory `web`) | [기술 선택 v1.1](문서/설계/기술선택-v1.1.md) |
| DB·로그인·파일 | Supabase (Postgres + RLS + Storage) | [supabase/README.md](supabase/README.md) |
| 기록 초안 Agent·번역·도우미 | Claude, 코디세이 공개 API(Anthropic 규격) | [코디세이 API 사용 방법](문서/설계/코디세이api-v1.0.md) |
| 받아쓰기(STT) | Groq Whisper `whisper-large-v3` (OpenAI 호환) | [결정 기록](문서/결정/2026-10-20-stt-groq.md) |
| 녹음·듣기·인쇄 | 브라우저 MediaRecorder(최대 5분), 브라우저 TTS, 인쇄 CSS | [기술 선택 v1.1](문서/설계/기술선택-v1.1.md) |

## 외부 API와 키

키는 서버 환경 변수(로컬 `web/.env.local`, 배포 Vercel)에만 둡니다. 브라우저 코드와 저장소에는 넣지 않습니다(AGENTS.md 원칙 6). 키가 없으면 `USE_MOCK_AI=true`(기본)로 가짜 응답을 씁니다.

| 서비스 | 환경 변수 | 주의 |
| --- | --- | --- |
| 코디세이 (Claude) | `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `AI_MODEL_MAIN`, `AI_MODEL_LIGHT` | 키는 Bearer로 보내야 해서 `ANTHROPIC_API_KEY`가 아님. 월 1,000,000 차감 토큰이라 개발은 Mock·Haiku로 |
| Groq (STT) | `GROQ_API_KEY`, `STT_BASE_URL`, `STT_MODEL` | 무료 한도: 분당 20건, 시간당 음성 7,200초 |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개 키만 브라우저로. 권한은 RLS가 막음 |

설정이 맞는지는 `/api/health`에서 봅니다(키 값은 나오지 않음).

## 앱 API

화면과 서버가 주고받는 API 경로·입출력, 상태 값, Agent 도구 4개는 [데이터 구조 v1.6.5 '공통 계약'](문서/설계/데이터구조-v1.6.5.md)에만 적습니다. 바꾸려면 `문서/결정/`에 결정 기록을 먼저 씁니다([AGENTS.md](AGENTS.md) '공통 계약 위치').

## 문서 지도

| 무엇을 알고 싶나 | 문서 |
| --- | --- |
| 무엇을 왜 만드나 | [기획안 v1.1.1](문서/기획/기획-v1.1.1.md) |
| 화면 W0~W6, R1~R4 | [화면 설계 v1.3](문서/설계/화면-v1.3.md) |
| 표·권한·공통 계약 | [데이터 구조 v1.6.5](문서/설계/데이터구조-v1.6.5.md) |
| AI가 지켜야 할 규칙 | [AI 규칙 v1.1.3](문서/설계/ai규칙-v1.1.3.md) |
| 시연·일정·테스트 | [시연·일정 v1.1](문서/설계/시연-일정-v1.1.md) |
| 무엇을 언제 왜 정했나 | [결정 기록](문서/결정/README.md) |

## 폴더

| 폴더 | 넣는 것 |
|---|---|
| `문서/` | 우리 팀이 만든 기획·설계 문서와 회의록 |
| `참고자료/` | 밖에서 받은 자료와 제출한 파일 |
| `web/` | 앱 코드 (Next.js). 실행 방법은 [web/README.md](web/README.md) |
| `supabase/` | DB 표·권한(RLS) 설정. [supabase/README.md](supabase/README.md) |

자세한 기준은 각 폴더의 `README.md`를 봅니다.

## 파일 이름 규칙

1. Shift 없이 입력되는 글자만 씁니다: 한글, 영문, 숫자, `-`, `.`
2. 공백, `_`, 괄호, `[]`, `·`, `+`는 쓰지 않습니다.
3. 단어는 붙여 쓰고, 덩어리 사이만 `-`로 나눕니다.
4. 순서는 `날짜-내용-사람-버전`이고, 해당하는 것만 씁니다. 서식 개정일처럼 "몇 년 판"을 뜻하는 날짜는 버전 자리(맨 끝)에 둡니다.
5. `케어브릿지` 접두어와 폴더 이름과 겹치는 말은 뺍니다.

예: `회의록/2026-10-15-멘토링.md`, `기획/기획-v0.3.md`, `인터뷰/2026-10-12-간호사-데이터 담당.md`

이 규칙은 `문서/`와 `참고자료/`에만 적용합니다. 코드 폴더(`web/`, `supabase/`, `.github/` 등)는 Next.js·Supabase·GitHub이 정한 이름(`[id]`, `(auth)`, `_` 등)을 그대로 따르고, 코드가 깨졌는지는 CI가 확인합니다.

올리면 GitHub Actions의 "파일 이름 검사"가 `문서/`·`참고자료/`의 1·2번 규칙을 자동으로 확인합니다. 커밋 옆에 빨간 X가 뜨면 Actions 로그에 나온 파일 이름을 고쳐 다시 올립니다.
