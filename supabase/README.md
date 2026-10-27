# supabase

Supabase(Postgres + 로그인 + Storage)의 표·권한(RLS)·시험 데이터를 코드로 두는 폴더입니다.

- **목적:** 표와 RLS를 대시보드에서 손으로 만들지 않고 파일로 남겨, 누가 언제 무엇을 바꿨는지 PR로 보이게 합니다.
- **배경:** 모든 표를 기관별 RLS로 나눠야 하고(AGENTS.md 원칙 7), 여러 사람이 동시에 개발합니다.
- **근거:** 데이터 구조 v1.6(`문서/설계/데이터구조-v1.6.md`), 기술 선택 v1.1 §3.
- **사유:** Supabase CLI의 기본 구조(`config.toml`, `migrations/`, `seed.sql`)를 그대로 써서 새로 배울 것을 줄입니다.

## 들어 있는 것

| 파일 | 내용 |
| --- | --- |
| `config.toml` | `supabase init`이 만든 로컬 설정 (기본값 그대로) |
| `migrations/20261021000000_init.sql` | 표 12개, 기관별 RLS, 상태 변화 검사 트리거, 용어 검색 함수, 녹음 버킷 `audio`와 Storage RLS |
| `migrations/20261025230000_missed_records.sql` | 못 쓴 기록: 방문 요일·담당 시작일, 하루 1건, 한국 날짜, `no_care_days`, `list_missed_records` |
| `migrations/20261027100000_trainer_flow.sql` | 강사흐름통일: `commented`·`comments` 표 뺌, 교육용 기관도 수정·되돌리기·승인 |
| `migrations/20261027120000_late_submit.sql` | 늦게 보낸 기록 계산 함수 `record_late_submit` |
| `migrations/20261027140000_permissions.sql` | 권한 정리: 이력은 DB 트리거만, `agent_steps`·`audio_jobs` 상태는 서버만, 되돌린 사유·원문·`source` 보호 |
| `seed.sql` | 데모 기관 2개, 합성 어르신 3명, 계정 4개, 담당 연결. 합성 사례만 |

## 쓰는 법

클라우드 Supabase 프로젝트 하나를 팀이 같이 쓰는 것을 기본으로 합니다. 로컬 Supabase는 Docker가 있어야 해서 선택입니다.

```bash
# 저장소 루트에서
npx supabase login
npx supabase link --project-ref <프로젝트-ref>     # 대시보드 주소의 ref
npx supabase migration new <이름>                  # 예: init (영어)
npx supabase db push                               # migrations/ 를 클라우드 DB에 반영
```

## 데모 계정 (seed.sql)

| 이메일 | 기관 | 역할 | 시나리오 |
| --- | --- | --- | --- |
| worker@carebridge.test | 데모 요양센터 (일반) | 작성자 '마이' (vi) | 1·2 |
| reviewer@carebridge.test | 데모 요양센터 (일반) | 담당자 '박 사회복지사' | 1·2 |
| trainee@carebridge.test | 데모 교육원 (교육용) | 교육생 (vi) | 3 |
| trainer@carebridge.test | 데모 교육원 (교육용) | 강사 | 3 |

- 어르신: 김○○(시설, 별지 제16호), 이○○(재가, 제12호, 평일 14:00~17:00)은 '마이' 담당, 최○○(시설)은 교육생 담당.
- **로컬**(`npx supabase db reset`): 계정이 없으면 비밀번호 `carebridge-local-only`로 만듭니다. 로컬 전용입니다.
- **클라우드:** 저장소가 공개라 비밀번호를 파일에 두지 않습니다. 대시보드 Authentication → Add user로 위 이메일 4개를 만든 뒤(비밀번호는 팀 비공개, Auto Confirm 켜기), SQL Editor에서 `seed.sql`을 돌립니다. 계정은 건너뛰고 기관·어르신·프로필만 들어갑니다. `db push --include-seed`는 쓰지 않습니다.

## 데모 되돌리기 (reset-demo.sql)

리허설 뒤 SQL Editor에서 `reset-demo.sql`을 돌리면 김○○(시나리오 1)의 기록이 모두 지워져 W1 카드가 '작성 전'으로 돌아갑니다. 승인된 기록도 지웁니다(삭제 막는 트리거를 트랜잭션 안에서만 끔). 시연 직전에 W1 카드를 한 번 확인합니다.

## 서버 코드가 알아야 할 것

- **상태 변화와 승인 검사는 DB도 막습니다.** API가 먼저 검사해 409를 돌려주고, 놓쳐도 트리거가 아래 오류로 거절합니다. Supabase 오류의 `message`가 이 키입니다.

| 오류 키 | 뜻 | 권장 응답 |
| --- | --- | --- |
| `unresolved_needs_check` | 정하지 않은 '확인 필요'가 남아 승인 불가 (`details` = 남은 개수) | 409 + 남은 항목 목록 |
| `invalid_transition` | 상태 변화 표에 없는 변경 | 409 |
| `record_locked` | approved 기록은 못 고침 | 409 |
| `return_reason_required` | 되돌리기 사유 없음 | 400 |
| `reviewer_only`, `not_record_worker` | 그 사람은 못 하는 일 (교육용 기관의 강사도 담당자와 같음) | 403 |
| `human_value_protected` | source가 worker·reviewer인 항목을 source = ai로 덮어쓰려 함 (원칙 4) | 건너뜀 |
| `org_mismatch` | 작성자와 어르신의 기관이 다름 | 403 |

- RLS로 걸러진 갱신은 오류 없이 **0행**이 됩니다. API는 `update(...).select()`로 바뀐 행이 있는지 봐야 합니다.
- 화면·API가 보내지 않아도 DB가 채우는 칸: 모든 표의 `org_id`(기록·어르신에서), `records.form_type`(care_type에서), `worker_id`·`author_id`·`actor_id`(로그인한 사람), `submitted_at`·`approved_at`·`approved_by`(상태 변화 때). 클라이언트는 이 칸을 쓸 권한이 없습니다.
- 기록을 만들면 9개 항목(`not_mentioned`, `source = ai`)과 `created` 이력이 자동으로 생깁니다. 상태가 바뀌면 `submitted`·`returned`·`approved` 이력도 자동입니다. 항목이 바뀌면 `ai_filled`(source = ai)·`edited`·`resolved`(담당자가 resolution을 바꿈)도, 원문·서식 칸·방문 시간이 바뀌면 `edited`(item_key 빈값)도 DB 트리거가 바뀐 칸만 남깁니다. **API는 이력을 쓰지 않습니다**(결정 `2026-10-27-권한정리`).
- 서버 전용 쓰기: `agent_steps` 넣기와 `audio_jobs` 상태·경로 바꾸기는 service_role로 합니다(클라이언트는 PR #63의 `web/lib/supabase/admin.ts`). 로그인 사용자 권한으로는 거절됩니다.
- 되돌린 사유(`return_reason`·`return_reason_native`)는 담당자만(`reviewer_only`), 원문(`transcript`·`transcript_ko`)은 기록의 작성자만(`not_record_worker`) 바꿉니다. 담당자가 항목 내용을 고치면 `source`는 DB가 `reviewer`로 채웁니다.
- 작성자가 아닌 사람이 `value_ko`를 고치면 `confirmed`가 자동으로 false가 됩니다. [맞아요](`confirmed`)는 작성자만 바꿀 수 있습니다.
- 기록이 returned일 때 작성자(작성자 권한으로 도는 AI 항목 보태기 포함)가 `value_ko`·`status`·`detail`을 바꾸면 그 항목의 `resolution`이 자동으로 비워집니다(결정 `2026-10-21-되돌림재확인`). 비운 일도 `edited` 이력의 before/after에 `resolution`으로 자동으로 남습니다.
- 실명 검사: validate_draft·submit_draft를 부를 때 `blockedNames`에 `getBlockedNames(supabase, org_id)`(`web/lib/agent/blocked-names.ts`) 결과를 넣습니다(결정 `2026-10-21-재가분칸-실명목록`).
- 용어 검색(search_terms)은 `supabase.rpc('search_glossary', { expression, max_results })`를 부릅니다. 결과 칸: `matched_expression, term_ko, term_vi, plain_ko, chapter, page`. 받아쓴 문장 안에 용어 표현이 들어 있어도 찾습니다.

## 남은 것

- 용어 CSV(`expression,aliases,term_ko,term_vi,plain_ko,chapter,page`)를 데이터 담당이 올리면 시드로 넣기.
- 남은 녹음 파일 주기 정리(1시간 넘은 것, Storage API, service_role).
- 서식 기준 데이터(`get_form_spec`용)는 표 없이 서버 코드 안 JSON(결정 기록 `문서/결정/2026-10-21-용어표.md`).
