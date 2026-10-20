"""파일 이름 규칙 검사 (루트 README.md "파일 이름 규칙").

목적: 팀원이 웹 업로드로 올려도 규칙에 어긋난 이름을 바로 알려 준다.
검사: 1·2번 규칙(허용 글자), 한글 NFC 정규화는 실패로, 50MB 넘는 파일은 경고로 알린다.
3~5번 규칙(띄어쓰기 방식·순서·중복어)은 사람이 판단해야 해서 검사하지 않는다.
범위: 문서/·참고자료/만 검사한다. 코드 폴더(web/, supabase/, .github/ 등)는 Next.js·Supabase·GitHub이
정한 이름([id], (auth), _ 등)을 그대로 써야 해서 제외하고, 대신 CI(lint·타입 검사·빌드)가 확인한다.
"""
import os
import re
import subprocess
import sys
import unicodedata

ALLOWED = re.compile(r"^[가-힣A-Za-z0-9.\-]+$")
MAX_BYTES = 50 * 1024 * 1024
CHECKED_DIRS = ("문서/", "참고자료/")

paths = subprocess.run(
    ["git", "-c", "core.quotepath=false", "ls-files", "-z"],
    capture_output=True, text=True, check=True,
).stdout.split("\0")

problems = []
warnings = []
for path in filter(None, paths):
    if not unicodedata.normalize("NFC", path).startswith(CHECKED_DIRS):
        continue
    bad = [part for part in path.split("/") if not ALLOWED.match(part)]
    if bad:
        chars = sorted({c for part in bad for c in part if not ALLOWED.match(c)})
        shown = " ".join("공백" if c == " " else c for c in chars)
        problems.append(f"{path}\n    → 쓸 수 없는 글자: {shown}")
    if unicodedata.normalize("NFC", path) != path:
        problems.append(f"{path}\n    → 한글이 자모로 풀려 있음(맥 NFD). 이름을 다시 입력해 올려 주세요.")
    if os.path.getsize(path) > MAX_BYTES:
        mb = os.path.getsize(path) / 1024 / 1024
        warnings.append(f"{path}: {mb:.0f}MB. 50MB 넘는 파일은 되도록 레포 대신 Discord에 둡니다.")

for w in warnings:
    print(f"::warning::{w}")

if problems:
    print("파일 이름 규칙에 맞지 않는 파일이 있습니다. 루트 README.md의 '파일 이름 규칙'을 보고 고쳐 주세요.\n")
    print("\n".join(problems))
    print("\n허용 글자: 한글, 영문, 숫자, -, .  (공백, _, 괄호, [], ·, + 는 안 됨)")
    print("예: 회의록/2026-10-15-멘토링.md, 인터뷰/2026-10-12-간호사-데이터 담당.md")
    sys.exit(1)
print("모든 파일 이름이 규칙에 맞습니다.")
