# supabase

Supabase(Postgres + 로그인 + Storage)의 표·권한(RLS)·시험 데이터를 코드로 두는 폴더입니다.

- **목적:** 표와 RLS를 대시보드에서 손으로 만들지 않고 파일로 남겨, 누가 언제 무엇을 바꿨는지 PR로 보이게 합니다.
- **배경:** 모든 표를 기관별 RLS로 나눠야 하고(AGENTS.md 원칙 7), 여러 사람이 동시에 개발합니다.
- **근거:** 데이터 구조 v1.6.4(`문서/설계/데이터구조-v1.7.md`), 기술 선택 v1.1 §3.
- **사유:** Supabase CLI의 기본 구조(`config.toml`, `migrations/`, `seed.sql`)를 그대로 써서 새로 배울 것을 줄입니다.

## 들어 있는 것

| 파일 | 내용 |
| --- | --- |
| `config.toml` | `supabase init`이 만든 로컬 설정 (기본값 그대로) |
| `migrations/20261021000000_init.sql` | 표 12개, 기관별 RLS, 상태 변화 검사 트리거, 용어 검색 함수, 녹음 버킷 `audio`와 Storage RLS |
| `migrations/20261025230000_missed_records.sql` | 못 쓴 기록: 방문 요일·담당 시작일, 하루 1건, 한국 날짜, `no_care_days`, `list_missed_records` |
| `migrations/20261027100000_trainer_flow.sql` | 강사흐름통일: `commented`·`comments` 표 뺌, 교육용 기관도 수정·되돌리기·승인 |
| `migrations/20261027110000_missed_draft.sql` | 못 쓴 기록: 임시 저장은 날짜 제한 없이, 기록 없음(`missing`)만 지난 7일 |
| `migrations/20261027120000_late_submit.sql` | 지연전송 기록 계산 함수 `record_late_submit` |
| `migrations/20261027130000_join_codes.sql` | 가입 코드 표 `join_codes`(관리자·강사는 같은 기관 것 읽기만) |
| `migrations/20261027140000_permissions.sql` | 권한 정리: 이력은 DB 트리거만, `agent_steps`·`audio_jobs` 상태는 서버만, 되돌린 사유·원문·`source` 보호 |
| `migrations/20261028093357_record_contract_guards.sql` | 이유 번역 보존·needs_check+omitted·제출 검사·출처 보호·프로필 조회 분리 |
| `migrations/20261028100000_overdue_records.sql` | 기한 지난 빈 기록: `list_overdue_records`(8~30일 전, 관리자·강사만), 관리자는 `no_care_days`를 30일 전까지 |
| `migrations/20261028120000_resolution_note.sql` | [기록 안 함] 사유 칸 `resolution_note`(관리자만, omitted일 때만, 이력에 남음) |
| `migrations/20261028130000_save_ai_item.sql` | 서버 전용 `save_ai_item`: 항목 하나 재번역(value_native만)·AI 항목 보태기, 기준 글이 다르면 `stale_item` |
| `migrations/20261028150000_return_reason_native.sql` | 되돌린 사유 번역 저장 함수 `save_return_reason_native`(service_role 전용, 사유가 바뀌었으면 `stale_reason`) |
| `migrations/20261029130000_english_names.sql` | 영어 이름 세 개: `confirmed` → `confirmed_by_worker`, Agent 도구 `search_glossary`·`return_draft`, 칸 이름을 쓰는 함수 다시 만들기 |
| `migrations/20261029160000_save_ai_item_check.sql` | `save_ai_item` mode `check`: 재가 제공 지원 재검사(검사 5) 결과로 status·reason·reason_native만 바꿈(작성자, draft·returned) |
| `migrations/20261031100000_helper_messages.sql` | W6(도우미) 대화 표 `helper_messages`(#218, 표 14개): 넣기는 서버(service_role)만, 작성자는 내 행·관리자·강사는 같은 기관 읽기, `org_id`는 DB가 작성자 프로필에서 채움 |
| `seed.sql` | 데모 기관 2개, 합성 어르신 3명, 계정 4개, 담당 연결. 합성 사례만 |
| `demo-data.sql` | 시연 데이터 다시 채우기(#156): 데모 두 기관의 기록을 지우고 합성 어르신 8명·시연용 배경 기록 14건을 넣음. `data/demo/build_demo_sql.py`가 만듦 |
| `reset-demo.sql` | 리허설 뒤 시나리오 1·2·3 어르신의 '오늘' 기록만 지움 |

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
| reviewer@carebridge.test | 데모 요양센터 (일반) | 관리자 '박 사회복지사' | 1·2 |
| trainee@carebridge.test | 데모 교육원 (교육용) | 교육생 '응옥' (vi) | 3 |
| trainer@carebridge.test | 데모 교육원 (교육용) | 강사 | 3 |

- 어르신: 김○○(시설, 별지 제16호), 이○○(재가, 제12호, 평일 14:00~17:00)은 '마이' 담당, 최○○(시설)은 교육생 '응옥' 담당. 이름이 역할과 같으면 화면에 '교육생 교육생'으로 보여 가명을 씁니다(#181).
- **로컬**(`npx supabase db reset`): 계정이 없으면 비밀번호 `carebridge-local-only`로 만듭니다. 로컬 전용입니다.
- **클라우드:** 저장소가 공개라 비밀번호를 파일에 두지 않습니다. 대시보드 Authentication → Add user로 위 이메일 4개를 만든 뒤(비밀번호는 팀 비공개, Auto Confirm 켜기), SQL Editor에서 `seed.sql`을 돌립니다. 계정은 건너뛰고 기관·어르신·프로필만 들어갑니다. `db push --include-seed`는 쓰지 않습니다.

## 시연 데이터 (demo-data.sql, reset-demo.sql)

| 언제 | 돌릴 것 | 결과 |
| --- | --- | --- |
| 시연 전날(또는 데이터가 어수선할 때) | `demo-data.sql` | 데모 요양센터·데모 교육원의 기록·기록 없음 처리를 모두 지우고, 그날 기준 날짜로 시연용 배경 기록을 다시 채움 |
| 리허설 한 번 끝날 때마다 | `reset-demo.sql` | 김○○·이○○·최○○(시나리오 1·2·3)의 **오늘** 기록만 지움. 배경 기록은 그대로 |

- 둘 다 SQL Editor에서 통째로 한 번 실행합니다. 여러 번 돌려도 같은 모양이고, 승인된 기록을 지우려고 삭제 막는 트리거를 트랜잭션 안에서만 끕니다.
- `demo-data.sql`은 `seed.sql`과 데모 계정 4개가 먼저 있어야 합니다(없으면 `demo_accounts_missing`).
- 이력 시각: 돌봄 날 작성·전송 → **다음 날 오전 관리자 승인·되돌리기**(기록마다 09:05~11:25), 되돌린 기록은 다음 날 오후 재전송. 다음 날 시각이 아직 안 왔으면(어제 기록을 아침에 돌릴 때) 그 기록만 돌봄 날 저녁으로 둡니다. 언제 돌려도 미래 시각은 생기지 않습니다(#181).
- 채워지는 모양(검토 대기 6·수정 필요 1·임시 저장 1·승인 완료 6, 작성 전, 기한 지난 빈 기록, 기록 없음 처리)은 파일 맨 위 주석과 `data/README.md` '시연 데이터'에 있습니다.
- 내용을 바꾸려면 `data/cases/`나 `data/demo/demo-data.head.sql`을 고치고 `python3 data/demo/build_demo_sql.py`로 다시 만듭니다. `demo-data.sql`을 직접 고치지 않습니다.
- 시연 직전에 W1(김○○·이○○ 카드가 '작성 전')과 M1 숫자를 한 번 확인합니다.

## 서버 코드가 알아야 할 것

- **상태 변화와 승인 검사는 DB도 막습니다.** API가 먼저 검사해 409를 돌려주고, 놓쳐도 트리거가 아래 오류로 거절합니다. Supabase 오류의 `message`가 이 키입니다.

| 오류 키 | 뜻 | 권장 응답 |
| --- | --- | --- |
| `unresolved_needs_check` | 정하지 않은 '확인 필요'가 남아 승인 불가 (`details` = 남은 개수) | 409 + 남은 항목 목록 |
| `invalid_transition` | 상태 변화 표에 없는 변경 | 409 |
| `record_locked` | approved 기록은 못 고침 | 409 |
| `return_reason_required` | 되돌리기 사유 없음 | 400 |
| `reviewer_only`, `not_record_worker` | 그 사람은 못 하는 일 (교육용 기관의 강사도 관리자와 같음) | 403 |
| `human_value_protected` | source가 worker·reviewer인 항목을 source = ai로 덮어쓰려 함 (원칙 4) | 건너뜀 |
| `org_mismatch` | 작성자와 어르신의 기관이 다름 | 403 |

- 서버 API가 돌려주는 HTTP 코드와 그 밖의 오류 키(`not_signed_in`, `ai_not_configured`, `duplicate_audio` 등)는 데이터 구조 v1.6.4 공통 계약 '응답 코드와 오류 키'에 있습니다(결정 `2026-10-28-api응답코드`).
- RLS로 걸러진 갱신은 오류 없이 **0행**이 됩니다. API는 `update(...).select()`로 바뀐 행이 있는지 봐야 합니다.
- 화면·API가 보내지 않아도 DB가 채우는 칸: 모든 표의 `org_id`(기록·어르신에서), `records.form_type`(care_type에서), `worker_id`·`author_id`·`actor_id`(로그인한 사람), `submitted_at`·`approved_at`·`approved_by`(상태 변화 때). 클라이언트는 이 칸을 쓸 권한이 없습니다.
- 기록을 만들면 9개 항목(`not_mentioned`, `source = ai`)과 `created` 이력이 자동으로 생깁니다. 상태가 바뀌면 `submitted`·`returned`·`approved` 이력도 자동입니다. 항목이 바뀌면 `ai_filled`(source = ai)·`edited`·`resolved`(관리자가 resolution을 바꿈)도, 원문·서식 칸·방문 시간이 바뀌면 `edited`(item_key 빈값)도 DB 트리거가 바뀐 칸만 남깁니다. **API는 이력을 쓰지 않습니다**(결정 `2026-10-27-권한정리`).
- 서버 전용 쓰기: `agent_steps` 넣기와 `audio_jobs` 상태·경로 바꾸기는 service_role로 합니다(클라이언트는 PR #63의 `web/lib/supabase/admin.ts`). 로그인 사용자 권한으로는 거절됩니다.
- 되돌린 사유(`return_reason`·`return_reason_native`)는 관리자만(`reviewer_only`), 원문(`transcript`·`transcript_ko`)은 기록의 작성자만(`not_record_worker`) 바꿉니다. 예외: 사유의 모국어 번역은 작성자가 기록을 열 때 서버가 `save_return_reason_native`(service_role)로 채웁니다(결정 `2026-10-28-되돌림사유번역`). 관리자가 항목 내용을 고치면 `source`는 DB가 `reviewer`로 채웁니다.
- 작성자가 아닌 사람이 `value_ko`를 고치면 `confirmed_by_worker`가 자동으로 false가 됩니다. [맞아요](`confirmed_by_worker`)는 작성자만 바꿀 수 있습니다.
- 기록이 returned일 때 작성자(작성자 권한으로 도는 AI 항목 보태기 포함)가 `value_ko`·`status`·`detail`을 바꾸면 그 항목의 `resolution`이 자동으로 비워집니다(결정 `2026-10-21-되돌림재확인`). 비운 일도 `edited` 이력의 before/after에 `resolution`으로 자동으로 남습니다.
- 실명 검사: validate_draft·return_draft를 부를 때 `blockedNames`에 `getBlockedNames(serverClient, record_id, worker_id)`(`web/lib/agent/blocked-names.ts`) 결과를 넣습니다(결정 `2026-10-21-재가분칸-실명목록`).
- 용어 검색(search_glossary)은 `supabase.rpc('search_glossary', { expression, max_results })`를 부릅니다. 결과 칸: `matched_expression, term_ko, term_vi, plain_ko, chapter, page`. 받아쓴 문장 안에 용어 표현이 들어 있어도 찾습니다.

## 남은 것

- ~~용어 CSV를 시드로 넣기~~ → 10/28 `data/glossary/seed-glossary.sql`(51개)·`data/manual/seed-manual-sections.sql`(12절)을 클라우드 DB에 넣음. 10/30 M13(신체활동지원, #183)을 더해 13절 — 클라우드에서 한 번 더 돌리면 M13만 들어감. 둘 다 다시 돌려도 안전(`on conflict`·`where not exists`).
- ~~남은 녹음 파일 주기 정리~~ → 10/28 PR #80: `GET /api/cron/audio-cleanup`(service_role, Storage API)을 GitHub Actions `audio-cleanup.yml`이 매시간 부름. `CRON_SECRET`을 Vercel과 GitHub Secrets에 같은 값으로 둠.
- 서식 기준 데이터(`get_form_spec`용)는 표 없이 서버 코드 안 JSON(결정 기록 `문서/결정/2026-10-21-용어표.md`).

## 10/28 계약 보강

- 기록 안 함은 needs_check + omitted이며 DB가 두 언어 내용을 비웁니다. 다시 정하기는 resolution을 비웁니다.
- 제출은 9개 항목이 모두 confirmed_by_worker 또는 source=worker일 때 허용하며 거절 키는 unconfirmed_items입니다.
- source·evidence·reason·value_native·reason_native는 authenticated가 직접 쓰지 못합니다. 출처는 실제 사용자 내용 수정에 맞춰 DB가 정합니다. 사람 항목을 ai로 재분류하면 human_value_protected로 거절합니다.
- profiles는 자기 행만 직접 읽습니다. list_org_staff()는 관리자에게 같은 기관 id/name/role만 반환합니다.
- record_blocked_names(record_id, worker_id)는 해당 기록의 기관 이름만 읽는 service_role 전용 RPC입니다.
- save_record_ai_draft는 작성자·기관·상태·expected_transcript를 검사하는 service_role 전용 RPC이며 사람 수정 항목은 건너뜁니다. 사용자 RLS 재조회에서 reason_native도 반환합니다.
- 번역(value_native·reason_native) 변경도 DB 이력에 보존합니다. 실제 Agent API·화면 연결과 클라우드 적용은 후속 작업입니다.
- 사용자 요청으로 추가 수동 검증을 중단했습니다. supabase/tests/record-contract.sql은 마지막 ROLLBACK으로 합성 픽스처를 제거하는 회귀 SQL입니다.
- [기록 안 함] 사유는 `record_items.resolution_note`입니다. omitted일 때만 있고 비면 `note_required`, 작성자가 쓰면 `reviewer_only`입니다. resolution이 바뀌면 DB가 비웁니다. 회귀 SQL은 `supabase/tests/resolution-note.sql`입니다(결정 `2026-10-28-기록안함사유`).
- 항목 하나 저장은 service_role 전용 `save_ai_item(record_id, item_key, actor_id, expected_value_ko, mode, item)`입니다. mode `translation`은 PATCH와 같은 사람(draft·returned 작성자, submitted 관리자)의 value_native만, `item`은 작성자의 음성 보태기 항목 전체(source = worker, confirmed_by_worker = false)를 저장합니다. 서버 코드는 `saveItemTranslation`·`saveAddedItem`(`web/lib/agent/draft-repository.ts`), 회귀 SQL은 `supabase/tests/save-ai-item.sql`입니다(결정 `2026-10-28-항목하나저장`).
- (10/29) `save_ai_item` mode `check`는 재가 제공 지원 재검사(검사 5: 지원별 분 합 ≤ 방문 시간) 결과로 `status`·`reason`·`reason_native`만 바꿉니다. 작성자 본인이 draft·returned일 때만 되고, 내용·출처·`confirmed_by_worker`는 그대로입니다. 작성자가 W3에서 분·방문 시점을 고친 PATCH 뒤와 `/submit` 직전에 서버가 부릅니다(`web/lib/records/support-check.ts`, `saveItemCheck`). 결정 `2026-10-29-초안검사보강`.

## 어르신 실명·사진 (#99)

- `20261030113134_resident_names_photos.sql`: 10/30 실제 CareBridge DB 반영. `name`·`photo_path`, 비공개 `resident-photos`, 현재 사진 SELECT 정책, 직접 사진 경로 변경 차단, 기관 기본값.
- 새 명단은 `name` 사용. `alias`는 구버전 INSERT 호환만 남기며 기존 가명을 실명으로 추정하지 않습니다.
- 서버는 기존 `SUPABASE_SERVICE_ROLE_KEY`로 검사·변환한 JPEG를 저장합니다. 브라우저에 서버 키를 주지 않습니다.
- `supabase/tests/resident-photos.sql`: 두 기관·담당/미담당 작성자·직접 업로드·경로 위조·동명이인·삭제 후 접근 차단을 검사하고 ROLLBACK합니다. Storage 메타데이터만 쓰는 합성 픽스처입니다.
- 사진 읽기는 세션 인증 API, 공개/서명 URL 없음. 교체·삭제 시 Storage API 정리 실패는 `cleanup_pending`으로 응답하고 화면에서 알려 줍니다. 해당 파일은 현재 경로에서 빠져 읽기가 차단되지만, 운영자가 Storage API로 남은 파일 정리를 확인해야 합니다.
