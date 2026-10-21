# supabase

Supabase(Postgres + 로그인 + Storage)의 표·권한(RLS)·시험 데이터를 코드로 두는 폴더입니다.

- **목적:** 표와 RLS를 대시보드에서 손으로 만들지 않고 파일로 남겨, 누가 언제 무엇을 바꿨는지 PR로 보이게 합니다.
- **배경:** 모든 표를 기관별 RLS로 나눠야 하고(AGENTS.md 원칙 7), 여러 사람이 동시에 개발합니다.
- **근거:** 데이터 구조 v1.2(`문서/설계/데이터구조-v1.2.md`), 기술 선택 v1.1 §3.
- **사유:** Supabase CLI의 기본 구조(`config.toml`, `migrations/`, `seed.sql`)를 그대로 써서 새로 배울 것을 줄입니다.

## 들어 있는 것

| 파일 | 내용 |
| --- | --- |
| `config.toml` | `supabase init`이 만든 로컬 설정 (기본값 그대로) |
| `migrations/` | 표·RLS·Storage 버킷을 만드는 SQL. 아직 비어 있음 (백엔드 담당) |
| `seed.sql` | 로컬 시험 데이터. 합성 사례만 |

## 쓰는 법

클라우드 Supabase 프로젝트 하나를 팀이 같이 쓰는 것을 기본으로 합니다. 로컬 Supabase는 Docker가 있어야 해서 선택입니다.

```bash
# 저장소 루트에서
npx supabase login
npx supabase link --project-ref <프로젝트-ref>     # 대시보드 주소의 ref
npx supabase migration new <이름>                  # 예: init (영어)
npx supabase db push                               # migrations/ 를 클라우드 DB에 반영
```

## 백엔드 담당이 정할 것 (⚠️ 세팅에서 일부러 비워 둠)

- 표 12개 + RLS: 데이터 구조 v1.2 '표별 칸'·'권한 규칙'. glossary는 pg_trgm 색인, 용어 CSV를 시드로.
- 녹음 업로드: 비공개 버킷 `audio`(10MB, webm·mp4) + Storage RLS + 1회용 업로드 주소. 남은 파일 주기 정리는 Storage API로(SQL 삭제는 파일이 남음). 결정 기록 `문서/결정/2026-10-21-녹음업로드.md`.
- 서식 기준 데이터(`get_form_spec`용)는 표 없이 서버 코드 안 JSON(결정 기록 `문서/결정/2026-10-21-용어표.md`).
