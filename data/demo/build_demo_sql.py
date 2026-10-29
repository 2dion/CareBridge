"""시연용 배경 기록 SQL(supabase/demo-data.sql)을 data/cases/의 합성 사례로 만든다.

사용: python3 data/demo/build_demo_sql.py   (저장소 루트에서)
근거: 이슈 #156, 문서/회의록/2026-10-29-멘토링.md §2-3. 합성 사례만(AGENTS.md 원칙 9).
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / "data" / "cases"
OUT = ROOT / "supabase" / "demo-data.sql"


def load(cid):
    return json.loads((CASES / f"{cid}.json").read_text())


def items_of(case, overrides=None):
    by = {i["item_key"]: dict(i) for i in case["draft"]["items"]}
    for o in overrides or []:
        by[o["item_key"]] = {**by[o["item_key"]], **o}
    keep = ("item_key", "value_ko", "value_native", "status", "evidence", "reason", "detail")
    return [{k: by[key].get(k, {} if k == "detail" else "") for k in keep} for key in by]


def lit(obj):
    s = json.dumps(obj, ensure_ascii=False)
    return "$j$" + s + "$j$::jsonb"


def txt(s):
    return "'" + s.replace("'", "''") + "'"


f01, f02, f03, f04, f05 = (load(f"s-f0{i}") for i in range(1, 6))
h01, h02, h03, h04, h05 = (load(f"s-h0{i}") for i in range(1, 6))

# 시나리오 1 최종본: 작성자 보태기 뒤 식사 + 관리자 [확인함]
f01_final = items_of(f01, f01["after_worker_addition"]["items"])
f01_text = f01["transcript"] + " " + f01["after_worker_addition"]["spoken"]
# 시나리오 2 최종본: 되돌림 뒤 분 60/60/60, 인지 '유지'
h01_final = items_of(h01, [
    {"item_key": "support", "status": "observed", "reason": "",
     "detail": {**next(i for i in h01["draft"]["items"] if i["item_key"] == "support").get("detail", {}),
                "minutes": h01["review_flow_expected"]["after_fix"]["support_detail_minutes"]}},
    {"item_key": "cognition", "detail": {"trend": "same"}},
])

def visit(case):
    d = next(i for i in case["draft"]["items"] if i["item_key"] == "visit_time").get("detail", {})
    return (txt(d["start"]), txt(d["end"])) if d.get("start") else ("null", "null")

# 한 줄 = 기록 하나. when: 날짜 식(SQL), flow: 상태 흐름
# flow: approved / submitted / submitted_late / returned / resent / draft
RECORDS = [
    # 시설 (데모 요양센터)
    ("kim", "worker", "today - 2", f05, items_of(f05), "approved", None),
    ("kim", "worker", "today - 1", f01, f01_final, "approved", None),
    ("han", "worker", "today - 1", f02, items_of(f02), "submitted", None),
    ("kang", "worker", "today - 3", f03, items_of(f03), "approved", None),
    ("kang", "worker", "today - 1", f03, None, "draft", None),
    ("seo", "worker", "today - 3", f04, items_of(f04), "submitted_late", None),
    ("park", "worker", "today - 2", f05, items_of(f05), "returned",
     ("점심 섭취량을 1/2이상·1/2미만 중 하나로 확인해 적어 주세요.",
      "Vui lòng xác nhận lượng ăn bữa trưa là trên 1/2 hay dưới 1/2 rồi ghi lại.")),
    # 재가 (방문 요일에 맞춘 날짜)
    ("lee", "worker", "pg_temp.visit_day('lee', 1)", h01, h01_final, "approved", None),
    ("jeong", "worker", "pg_temp.visit_day('jeong', 1)", h02, items_of(h02), "submitted", None),
    ("yoon", "worker", "pg_temp.visit_day('yoon', 1)", h03, items_of(h03), "submitted", None),
    ("jang", "worker", "pg_temp.visit_day('jang', 1)", h04, items_of(h04), "resent",
     ("기저귀 교환 횟수와 실수 횟수 중 어느 값을 배변 칸에 적을지 다시 확인해 주세요.",
      "Vui lòng kiểm tra lại nên ghi số lần thay tã hay số lần không tự chủ vào ô đại tiểu tiện.")),
    ("oh", "worker", "pg_temp.visit_day('oh', 1)", h05, items_of(h05), "approved", None),
    # 교육용 기관
    ("choi", "trainee", "today - 2", f05, items_of(f05), "approved", None),
    ("choi", "trainee", "today - 1", f02, items_of(f02), "submitted", None),
]

parts = []
for res, who, when, case, items, flow, ret in RECORDS:
    vs, ve = visit(case)
    transcript = f01_text if case is f01 else case["transcript"]
    ff = dict(case["draft"]["form_fields"])
    if case is h01:
        ff["cognition_trend"] = "same"
    parts.append(
        f"  perform pg_temp.demo_record({txt(res)}, {txt(who)}, {when}, {txt(transcript)}, {txt(case['transcript_ko'])},\n"
        f"    {lit(items) if items else 'null'}, {lit(ff)}, {vs}, {ve}, {txt(flow)}, "
        f"{txt(ret[0]) if ret else 'null'}, {txt(ret[1]) if ret else 'null'}, {txt(case['case_id'])});"
    )

head = (ROOT / "data" / "demo" / "demo-data.head.sql").read_text()
OUT.write_text(head.replace("--@@RECORDS@@", "\n".join(parts)))
print(f"wrote {OUT.relative_to(ROOT)} ({len(RECORDS)} records)")
