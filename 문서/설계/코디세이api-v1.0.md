# 케어브릿지 코디세이 API 사용 방법 v1.0

2026-10-20 · @2dion

## 이 문서는 왜 있나

- **목적:** 케어브릿지 서버가 코디세이 공개 API로 Claude를 부르는 방법을 한 곳에 정해, 팀원 누구나 같은 설정으로 개발하게 합니다.
- **배경:** v1.1 설계는 Claude API와 OpenAI STT를 팀이 직접 결제해 쓰는 것으로 가정했고, 키를 누가 준비할지는 비어 있었습니다.[1] 10/20 코디세이가 학습자용 공개 API를 열어, 기관 비용으로 Claude를 쓸 수 있게 되었습니다.[2]
- **근거:** 코디세이 공개 API 매뉴얼과 콘솔 문서 탭(`참고자료/코디세이/2026-10-20-공개api매뉴얼.md`), 기술 선택·AI 규칙 v1.1.1, 결정 기록 [2026-10-20-코디세이api.md](../결정/2026-10-20-코디세이api.md)입니다.[1][2][3][4]
- **사유:** 공개 API는 Anthropic 규격(`/v1/messages`)을 그대로 받으므로, v1.1의 Agent 구조(도구 사용 + 서버 반복)를 바꾸지 않고 주소와 키만 바꿔 쓸 수 있습니다.[2][3]

## 한눈에 보기

**왜:** 바쁜 팀원이 이 표만 보고도 개발을 시작할 수 있게 합니다.

| 항목 | 정한 것 |
| --- | --- |
| 쓰는 규격 | Anthropic 규격 `POST /v1/messages` (Claude) |
| 주소 | `https://copa.codyssey.kr` (환경 변수로 둠. 바뀔 수 있음) |
| 중간 등급 모델 | `claude-sonnet-4` (Sonnet 4.6, 차감 배수 1): Agent, 항목 보태기 |
| 가벼운 등급 모델 | `claude-haiku-4` (Haiku 4.5, 차감 배수 0.5): 짧은 번역, 도우미 |
| 키 | 코디세이 Anthropic 호환 키. 서버 환경 변수에만 |
| 받아쓰기(STT) | 공개 API에 없음 → Groq Whisper 무료 API (10/20 결정, [결정 기록](../결정/2026-10-20-stt-groq.md)) |
| 듣기(TTS) | 브라우저 내장 먼저. 베트남어 목소리가 없으면 공개 API `/api/v1/audio/tts` |
| 키 없을 때 | `USE_MOCK_AI=true`로 Mock 응답 |

## 1. v1.1 설계와 달라지는 곳

**왜:** 이미 쓴 설계 문서 중 어디를 고쳐야 하는지 짚어 둡니다. 공통 계약(API 경로, 상태 값, 도구 입출력)은 바뀌지 않습니다.

| 문서·절 | v1.1 | 코디세이 API로 | 고칠 것 |
| --- | --- | --- | --- |
| 기술 선택 §6·§7 Claude 호출 | Anthropic에 직접, 팀이 결제 | 코디세이 주소로, 기관이 결제 | 주소·키만. 구조 그대로 (이 PR에서 고침) |
| 기술 선택 §5 STT | 서버 STT(OpenAI 음성 인식) | 공개 API에 STT 없음 | ⚠️ 정해야 함 (아래 'STT') |
| 기술 선택 §8 TTS | 브라우저 먼저, 부족하면 서버 TTS | 서버 TTS를 공개 API로 쓸 수 있음 | 대안 칸만 (이 PR에서 고침) |
| 기술 선택 '비용' | 쓴 만큼 결제, 계정마다 월 한도 | 계정마다 월 1,000,000 차감 토큰 | 토큰 계산 방법 (아래 '토큰') |
| AI 규칙 'AI가 하는 일' | 등급만, 이름은 설정 한 곳 | 그대로. 설정값이 코디세이 모델 ID | 없음 |
| AI 규칙 '서버 검사와 예외 처리' | 시간 초과·연결 오류 한 번 다시 | 401·403·409·429·503 오류가 더 있음 | 아래 '오류 처리'를 BE가 구현 |
| 데이터 구조 agent_steps.tokens | 쓴 토큰 수 | 실제 토큰과 차감 토큰이 다름 | 실제 토큰만 저장, 차감은 계산 (표 변경 없음) |
| AGENTS.md 원칙 9 | 실명 금지, 합성 사례만 | 프롬프트·응답을 기관 운영자가 볼 수 있음 | 원칙 그대로 지키면 됨 |

## 2. 키 받기와 두는 곳

**왜:** 키 원문은 한 번만 보이고, 새면 기관 비용이 빠져나갑니다.[2]

1. 팀장이 콘솔(`https://usr.codyssey.kr/daejeon/public-api-console`)의 'API 키' 탭에서 **Anthropic 호환** 키를 발급합니다. 라벨은 `carebridge-server`.
2. 키 원문은 바로 Vercel 환경 변수와 각자의 `.env.local`에만 넣습니다. 카카오톡·Discord·문서·커밋에 붙이지 않습니다.
3. 모델 정책은 '목록만 허용'으로 `claude-sonnet-4`, `claude-haiku-4`만 엽니다. 실수로 비싼 모델을 부르는 것을 막습니다.
4. **허용 IP는 비워 둡니다.** Vercel 서버는 나가는 IP가 고정되지 않아 IP를 걸면 배포본이 막힙니다.
5. 새었다고 생각되면 바로 폐기하고 새로 발급한 뒤 Vercel 값을 바꿉니다.

⚠️ 팀원마다 자기 계정에서 키를 따로 받을지, 팀장 키 하나를 서버에만 둘지는 확인이 필요합니다. 매뉴얼은 "본인 학습 용도로만"이라고 하므로, 지금은 **배포 서버는 팀장 키, 각자 로컬 개발은 Mock 또는 본인 키**로 둡니다.[2]

### 환경 변수

```bash
# .env.local 예시 (값은 자리표시자. 진짜 키는 커밋하지 않음)
# 모두 서버 전용. NEXT_PUBLIC_ 을 붙이지 않는다.
ANTHROPIC_BASE_URL=https://copa.codyssey.kr
ANTHROPIC_AUTH_TOKEN=<코디세이-anthropic-호환-키>   # API_KEY 가 아니라 AUTH_TOKEN (아래 설명)
AI_MODEL_MAIN=claude-sonnet-4
AI_MODEL_LIGHT=claude-haiku-4
USE_MOCK_AI=true
```

- Anthropic 공식 SDK(`@anthropic-ai/sdk`)는 `ANTHROPIC_BASE_URL`과 `ANTHROPIC_AUTH_TOKEN`을 저절로 읽습니다. 그래서 코드에는 주소·키를 쓰지 않습니다.
- **키는 `Authorization: Bearer` 헤더로 보내야 합니다.** 10/20 시험에서 같은 키를 `x-api-key` 헤더로 보내면 401 `invalid x-api-key`, Bearer로 보내면 200이었습니다(매뉴얼은 두 방식 모두 된다고 하지만 이 주소에서는 `x-api-key`가 안 됨). SDK는 `ANTHROPIC_API_KEY`를 `x-api-key`로 보내므로, 이름을 `ANTHROPIC_AUTH_TOKEN`(코드에서는 `authToken` 옵션)으로 써서 Bearer로 나가게 합니다.[2][6]
- 모델 이름은 `AI_MODEL_MAIN`, `AI_MODEL_LIGHT` 두 곳에만 둡니다(AI 규칙 '모델 이름은 설정 한 곳').[4]
- `USE_MOCK_AI`는 기술검토 v1.5의 Mock 모드입니다. Production에서는 `false`여야 하고, Mock일 때 화면에 "MOCK"을 보여 줍니다.[5]

## 3. 호출 방법

**왜:** Agent 반복과 한 번 호출이 같은 함수를 쓰게 해, 오류 처리와 토큰 기록을 한 곳에서 합니다.

```typescript
// 서버 코드에서만 (app/api/... 또는 서버 전용 모듈)
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN(Bearer) 를 읽음

const response = await client.messages.create({
  model: process.env.AI_MODEL_MAIN!,
  max_tokens: 2048,                 // 필수
  system: "<AI 규칙 v1.1.1의 시스템 프롬프트>",
  tools: [/* 도구 4개: get_form_spec, search_terms, validate_draft, submit_draft */],
  messages: [{ role: "user", content: "<받아쓴 글과 어르신 정보>" }],
});

// response.content 에 text 블록과 tool_use 블록이 섞여 옴
// response.usage.input_tokens / output_tokens 를 agent_steps.tokens 에 남김
```

- 규격 차이: `max_tokens` 필수, 시스템 프롬프트는 최상위 `system`, 답은 `content` 블록 배열입니다.[2]
- 도구 사용(tool use): 공개 API는 Anthropic 규격을 그대로 넘깁니다("Protocol native"). 콘솔이 같은 키로 Claude Code를 붙이는 방법을 안내하는데, ✓ 10/20 도구 하나짜리 요청으로 확인했습니다: `claude-haiku-4`(실제 `claude-haiku-4-5-20251001`)가 `stop_reason: "tool_use"`로 도구를 부르고, 도구 결과를 돌려주면 그 값으로 최종 답을 했습니다(`end_turn`). 단 키는 Bearer 헤더로 보냈을 때만 됩니다.[2][6]
- 토큰 미리 세기: `POST /v1/messages/count_tokens`가 있어 Agent 한 번에 드는 토큰을 미리 잴 수 있습니다.[2]

## 4. 토큰 한도와 아끼는 법

**왜:** 한도를 다 쓰면 시연 날 AI가 멈춥니다(B5).[1]

- 계정마다 **월 1,000,000 차감 토큰**입니다(10/20 팀장 계정 기준). 차감 토큰 = (입력 + 출력 토큰) × 모델 차감 배수.[2]
- 대략 계산(추정): 녹음 5분 받아쓰기 ≈ 1,500토큰, 시스템 프롬프트 + 도구 정의 ≈ 3,000토큰. Agent는 응답마다 앞 대화를 다시 보내므로 4번이면 입력 ≈ 25,000, 출력 ≈ 3,000 → **기록 1건에 약 3만 차감 토큰(Sonnet)**. 월 한도로는 **약 30~40건**입니다. Haiku면 그 두 배쯤입니다.
- **10/28 실측 (BE, 합성 사례 S-F01, Sonnet):** 캐시 없이 Claude 응답 4번에 **31,778 차감**(입력 2,452 → 3,899 → 7,707 → 12,052, 출력 합 5,668). 추정과 같습니다. 시스템 프롬프트 + 도구 정의는 약 2,450토큰(draft 스키마를 넣은 뒤 약 3,500). 자세한 것은 AI 규칙 v1.1.1 '품질 확인 방법 → 첫 측정'.
- 그래서:
  1. 화면·흐름 개발은 Mock으로 합니다. 실제 호출은 프롬프트·Agent를 맞출 때만.
  2. 프롬프트를 고칠 때는 `AI_MODEL_MAIN=claude-haiku-4`로 먼저 돌리고, 품질 확인과 시연만 Sonnet으로.
  3. 시연용 합성 사례 결과는 미리 저장해 두고, 시연 중 실시간 호출은 1~2건만.
  4. 이 키를 Claude Code·Cursor에 붙여 코딩하지 않습니다. 매뉴얼도 "월 한도가 금방 소진된다"고 경고합니다.[2]
  5. 사용량 탭을 주 2회 봅니다(QA 담당). 50만이 넘으면 팀에 알립니다.
- 콘솔 사용량에 '캐시(입력/적중)' 칸이 있어 프롬프트 캐싱이 될 수도 있습니다. 되면 시스템 프롬프트·도구 정의를 캐시해 Agent 비용을 크게 줄입니다. **10/28:** 캐시 표시 없이 부른 1차 시험은 콘솔 캐시 칸이 0/0이었습니다. PR #86부터 Agent 호출에 `cache_control`(시스템 프롬프트·도구 정의·앞 대화)을 붙여 보냅니다(`web/lib/agent/prompt-cache.ts`). **✓ 10/28 22:24 2차 시험에서 적중 확인.** 콘솔 '최근 호출' Sonnet 4건: 캐시(입력/적중) 3,493/0 → 1,473/3,493 → 292/4,966 → 3,713/5,258, 차감 4,890 + 2,350 + 2,662 + 6,815 = **16,717**(캐시 없는 1차 31,778의 53%). 차감 계산은 Anthropic 기준과 같습니다: 캐시 쓰기 1.25배, 캐시 읽기 0.1배, 보통 입력·출력 1배(예: 2번째 호출 3,493×0.1 + 1,473×1.25 + 158 + 1 ≈ 2,350). 그래서 **Agent 1건 ≈ 1.7만 차감(Sonnet) → 월 한도로 약 60건**입니다. 응답마다 새로 캐시되는 부분(그 응답의 도구 결과)은 1.25배라, 도구 결과를 짧게 유지하는 것이 다음 절약 지점입니다.

## 5. 오류 처리

**왜:** AI 규칙 v1.1.1의 '서버 검사와 예외 처리'에 공개 API 오류를 맞춥니다.[4]

| 오류 | 뜻 | 서버가 할 일 |
| --- | --- | --- |
| 401 invalid_api_key / invalid x-api-key | 키 오타·폐기, 또는 키를 `x-api-key`로 보냄(Bearer로 보내야 함) | 다시 하지 않음. 로그에 남기고 화면에 "AI 연결 설정 오류" |
| 403 Provider credentials unavailable, 409, 503 | 기관 쪽 키 문제 | 한 번 다시. 또 실패하면 audio_jobs.status = failed, [다시 시도]·[글로 쓰기] |
| 한도 초과 | 월 차감 토큰 소진 | 다시 하지 않음. 화면에 [글로 쓰기]만, 팀에 알림 |
| 400 (max_tokens 등) | 요청 형식 오류 | 다시 하지 않음. 코드 버그로 기록 |
| 시간 초과·연결 오류 | 네트워크 | v1.1대로 한 번 다시 |

요청 속도 제한(rate limit)은 아직 정해지지 않았습니다.[2] 정해지면 이 표에 더합니다.

## 6. STT: A부터 시험 (10/20)

**왜:** 받아쓰기는 녹음 → 기록 흐름의 첫 단계라, 이것 없이는 Agent도 돌지 않습니다.

공개 API 목록에 음성 인식(STT)이 없습니다(TTS만 있음).[2] 고를 수 있는 길은 셋입니다. 결정 전까지 STT는 Mock(합성 받아쓰기 글)으로 개발합니다.

| 길 | 좋은 점 | 걸리는 점 |
| --- | --- | --- |
| A. 공개 API 채팅 모델에 음성을 직접 넣어 보기 (예: Gemini를 OpenAI 규격으로) | 추가 비용·키 없음 | 공개 API가 음성 입력을 넘기는지 모름. 키 받고 시험 1번 필요 |
| B. OpenAI 음성 인식 키를 팀이 따로 결제 | v1.1 설계 그대로, 품질 검증됨 | 결제 수단 필요, 키가 둘이 됨 |
| C. 브라우저 내장 음성 인식(Web Speech API) | 무료, 서버 STT 불필요 | v1.1에서 버린 이유(파이어폭스 미지원, iOS 사파리 끊김) 그대로. 녹음 파일 흐름이 바뀜 |

**10/20 팀장 결정:** A를 먼저 시험합니다. 안 되면 B·C를 포함해 다른 대안을 다시 찾습니다. 최종 방식이 정해지면 결정 기록을 따로 쓰고 기술 선택 §5와 이 절을 고칩니다.

### A 시험 방법

키를 받은 사람이 자기 컴퓨터에서 돌립니다(키를 채팅에 붙이지 않음). 합성 문장을 읽은 30초 이하 녹음 `sample.wav`(실명 없이)를 준비합니다.

```bash
# OpenAI 호환 키로. 키는 환경 변수에서 읽는다.
export CODYSSEY_KEY="<코디세이-openai-호환-키>"
B64=$(base64 < sample.wav | tr -d '\n')
curl https://copa.codyssey.kr/v1/chat/completions \
  -H "Authorization: Bearer $CODYSSEY_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"gemini-3-flash","messages":[{"role":"user","content":[
        {"type":"text","text":"이 녹음을 한국어로 그대로 받아써 주세요. 말하지 않은 내용은 쓰지 마세요."},
        {"type":"input_audio","input_audio":{"data":"'"$B64"'","format":"wav"}}]}]}'
```

| 결과 | 판단 |
| --- | --- |
| 받아쓴 글이 녹음과 맞음 | A 채택 후보. 크롬 webm·사파리 mp4 형식도 같은 방법으로 확인 |
| 400 등 형식 오류, 또는 음성을 무시한 답 | 공개 API가 음성 입력을 넘기지 않음 → 다른 대안 찾기 |
| 받아쓰기는 되지만 내용을 지어냄 | 품질 문제 → 샘플 5개로 비교 후 판단 |

`gemini-3-flash`가 안 되면 `gpt-5.4-mini` 등 다른 채팅 모델로 한 번 더 해 봅니다.

### A 시험 결과 (2026-10-20): 안 됨

| 시험 | 결과 |
| --- | --- |
| 합성 녹음 만들기: `/api/v1/audio/tts`, tts-1, wav, 한국어 3문장 | 200, 약 19초 wav. 차감 460토큰 |
| `gemini-3-flash`, `gemini-3.1-flash-lite`, `gemini-3.1-pro`, `gpt-5.4-mini`에 `input_audio` | 모두 400 `unsupported_feature` ("Requested feature is not supported.") |
| `gemini-3-flash`에 `file`·`image_url`(data URI) 형태 | 400 `unsupported_feature` |
| 같은 키로 글자만 보낸 채팅 | 200 (키 문제 아님) |

공개 API는 채팅에 글자 말고는 받지 않습니다. 그래서 A는 쓸 수 없고, 다른 대안을 찾습니다(팀장 10/20 "안 되면 다른 대안").

**최종 (10/20):** 받아쓰기는 Groq Whisper 무료 API로 정했습니다. 이유·한도·데이터 정책은 [결정 기록](../결정/2026-10-20-stt-groq.md)에 있습니다.

덤으로 확인한 것: OpenAI 호환 키로 `/v1/messages`를 부르면 403 "This API key is not allowed for the Anthropic-compatible API"입니다. Claude를 쓰려면 Anthropic 호환 키가 따로 있어야 합니다.

## 7. 처음 확인할 것 (키를 받은 날)

**왜:** 가정이 틀리면 첫 주 안에 알아야 일정이 버팁니다.

| # | 확인 | 방법 | 담당 |
| --- | --- | --- | --- |
| 1 | `/v1/messages` 기본 호출 | 콘솔 예제 curl 1번 | 팀장 |
| 2 | 도구 사용(tool use)이 넘어가는지 | 도구 1개 정의해 `stop_reason: "tool_use"`가 오는지 | ✓ 10/20 됨 (Bearer 헤더일 때만, §2) |
| 3 | 음성 입력이 되는지 (STT 길 A) | 짧은 합성 녹음 1개를 채팅 모델에 | ✓ 10/20 안 됨 (§6 결과) |
| 4 | Agent 1건 토큰 | `count_tokens` + 사용량 탭 | ✓ 10/28 Sonnet 4번 31,778 차감(캐시 없음). §4 실측 |
| 5 | 프롬프트 캐싱 적중 | 같은 요청 2번 후 사용량 탭 '캐시' 칸 | ✓ 10/28 적중. Agent 1건 31,778 → 16,717 차감 (§4) |
| 6 | 베트남어 TTS 목소리 | 시연 기기 브라우저, 안 되면 `/api/v1/audio/tts` | 프론트엔드 담당 |

결과는 이 표 옆에 적고, 3번 결과로 STT를 정합니다.

## 참고 자료

1. [기술 선택 v1.1](기술선택-v1.1.md) §5~8, '비용·위험·확인할 것'("STT·Claude API 키와 결제 수단을 누가 준비하는지").
2. [코디세이 공개 API 매뉴얼 옮김](../../참고자료/코디세이/2026-10-20-공개api매뉴얼.md): 엔드포인트, 키 정책, 차감 배수, 오류, 보안 주의사항.
3. [결정 기록: 텍스트 AI는 코디세이 공개 API로](../결정/2026-10-20-코디세이api.md).
4. [AI 규칙 v1.1.1](ai규칙-v1.1.1.md) 'AI가 하는 일', '서버 검사와 예외 처리', '비용·지연 (B5)'.
5. [기술검토 v1.5](기술검토-v1.5.md) 3장 #4 Mock 모드, 7장 #5.
6. 2dion 팀장 맥에서 10/20 직접 시험(합성 질문 1개, 도구 1개): `x-api-key`는 401, `Authorization: Bearer`는 200, 도구 사용 왕복 통과. 결정 기록의 '시험 결과' 참고.
