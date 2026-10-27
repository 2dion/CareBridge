"use client";

// 인쇄·PDF(피그마 D06, 화면 v1.3 R3): 기록 1건(하루) = 1장. 별지 서식 ‘모양’이며 공식 기록지가 아니다.
// 칸은 데이터구조 v1.6.1 ‘서식 칸 대응’ 표를 따른다. 서명란: 제16호 = 영역별 작성자, 제12호 = 장기요양요원 + 수급자 또는 보호자.
import { useParams, useRouter } from "next/navigation";

import { useDemo } from "@/components/demo/demo-provider";
import type { ItemKey } from "@/lib/demo/state";
import {
  type DemoRecord,
  getResident,
  kstDateOf,
  kstTime,
  supportMinuteKeys,
  supportMinutesTotal,
  visitMinutes,
  weekdayLabel,
} from "@/lib/demo/store";

function dotDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${y}. ${m}. ${d}. (${weekdayLabel(date)})`;
}

function value(record: DemoRecord, key: ItemKey) {
  return record.items.find((item) => item.item_key === key)?.value_ko.trim() ?? "";
}

function withCheck(record: DemoRecord, key: ItemKey) {
  const item = record.items.find((entry) => entry.item_key === key);
  if (!item?.value_ko.trim()) return "";
  return item.resolution === "confirmed_by_reviewer"
    ? `${item.value_ko} (담당자 확인함)`
    : item.value_ko;
}

function join(parts: string[]) {
  return parts.filter(Boolean).join(" ") || "언급 없음";
}

export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const demo = useDemo();
  if (!demo) return null;
  const { db } = demo;
  const record = db.records[id];
  if (!record) {
    return (
      <main className="d-app p-app">
        <p style={{ padding: 32 }}>기록을 찾을 수 없어요.</p>
      </main>
    );
  }
  const resident = getResident(db, record.residentId);
  const name = resident?.alias.replace(" 어르신", "") ?? "";
  const approved = record.status === "approved";
  const [, m, d] = record.careDate.split("-").map(Number);

  return (
    <main className="d-app p-app">
      <header className="p-bar no-print">
        <b>
          인쇄 미리보기 · {resident?.alias} · {m}월 {d}일
        </b>
        <div>
          <button
            type="button"
            className="dbtn"
            onClick={() => (window.history.length > 1 ? router.back() : window.close())}
          >
            닫기
          </button>
          <button type="button" className="dbtn" onClick={() => window.print()}>
            PDF로 저장
          </button>
          <button type="button" className="dbtn primary" onClick={() => window.print()}>
            인쇄
          </button>
        </div>
      </header>
      {!approved && (
        <p className="p-note no-print">
          승인 전 미리보기예요. 인쇄는 승인한 뒤 승인한 기록에서 해요. ‘PDF로 저장’은 인쇄 창에서
          ‘PDF로 저장’을 고르면 돼요.
        </p>
      )}
      <article className="sheet">
        <div className="sheet-head">
          <div>
            <small>[별지 제{record.formType}호 서식 모양]</small>
            <h1>장기요양급여 제공기록지 ({record.formType === "16" ? "시설급여" : "방문요양"})</h1>
          </div>
          <span className="stamp">공식 기록지 아님 · 합성 사례{approved ? "" : " · 승인 전"}</span>
        </div>
        <table className="form-grid">
          <tbody>
            <tr>
              <th>수급자</th>
              <td>{name} (가명)</td>
              <th>제공일</th>
              <td>{dotDate(record.careDate)}</td>
            </tr>
            <tr>
              <th>장기요양기관</th>
              <td>{db.worker.org}</td>
              <th>{record.formType === "16" ? "작성자" : "장기요양요원"}</th>
              <td>{db.worker.name}</td>
            </tr>
          </tbody>
        </table>
        {record.formType === "16" ? <Form16 record={record} /> : <Form12 record={record} />}
        <p className="sign-line">
          {approved
            ? `승인: ${record.approvedBy} · ${dotDate(kstDateOf(record.approvedAt!)).replace(/ \(.\)$/, "")} ${kstTime(record.approvedAt)}`
            : "승인 전"}
        </p>
        <footer>
          <span>케어브릿지에서 만든 인쇄용 화면입니다. 실제 제출은 기관의 공식 서식을 쓰세요.</span>
          <span>1 / 1</span>
        </footer>
      </article>
    </main>
  );
}

function Form16({ record }: { record: DemoRecord }) {
  const { db } = useDemo()!;
  const signed = `${db.worker.name} (서명)`;
  const rows = [
    {
      area: "신체활동지원",
      text: join([
        withCheck(record, "support"),
        withCheck(record, "meal"),
        withCheck(record, "sleep"),
        withCheck(record, "discomfort"),
      ]),
    },
    { area: "인지관리 및 의사소통", text: join([withCheck(record, "cognition")]) },
    { area: "건강 및 간호관리", text: join([withCheck(record, "medication")]) },
    { area: "기능회복훈련", text: "언급 없음" },
  ];
  const visit = value(record, "visit_time");
  const notes = withCheck(record, "notes");
  return (
    <>
      {visit && (
        <p className="sub-line">
          <b>맺음(입·퇴소·외박·외출)</b> {visit}
        </p>
      )}
      <h2>영역별 특이사항</h2>
      <table className="form-grid">
        <tbody>
          {rows.map((row) => (
            <tr key={row.area}>
              <th>{row.area}</th>
              <td className="wide">{row.text}</td>
              <th>작성자</th>
              <td>{row.text === "언급 없음" ? "—" : signed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {notes && (
        <p className="sub-line">
          <b>특이사항</b> {notes}
        </p>
      )}
    </>
  );
}

function Form12({ record }: { record: DemoRecord }) {
  const visitItem = record.items.find((item) => item.item_key === "visit_time");
  const start = typeof visitItem?.detail?.start === "string" ? visitItem.detail.start : "";
  const end = typeof visitItem?.detail?.end === "string" ? visitItem.detail.end : "";
  const support = record.items.find((item) => item.item_key === "support");
  const minutes = (support?.detail?.minutes ?? {}) as Record<string, number>;
  const checks = Array.isArray(support?.detail?.checks) ? (support.detail.checks as string[]) : [];
  const fields = record.formFields ?? {};
  const count = (key: string) => (typeof fields[key] === "number" ? `${fields[key]}회` : "—");
  const total = supportMinutesTotal(record);
  const visit = visitMinutes(record);
  return (
    <>
      <h2>일정관리</h2>
      <table className="form-grid">
        <tbody>
          <tr>
            <th>시작시간</th>
            <td>{start || "—"}</td>
            <th>종료시간</th>
            <td>{end || "—"}</td>
            <th>총시간</th>
            <td>{visit !== null ? `${visit}분` : "—"}</td>
          </tr>
        </tbody>
      </table>
      <h2>지원별 제공시간</h2>
      <table className="form-grid">
        <tbody>
          {supportMinuteKeys.map(({ key, ko }) => (
            <tr key={key}>
              <th>{ko}</th>
              <td>{minutes[key] ? `${minutes[key]}분` : "—"}</td>
            </tr>
          ))}
          <tr>
            <th>합계</th>
            <td>
              {total}분{visit !== null && total > visit ? " (방문 시간보다 김 · 확인 필요)" : ""}
            </td>
          </tr>
        </tbody>
      </table>
      {checks.length > 0 && (
        <p className="sub-line">
          <b>제공 지원 체크</b> {checks.join(", ")}
        </p>
      )}
      <h2>변화상태 · 배변변화</h2>
      <table className="form-grid">
        <tbody>
          <tr>
            <th>인지기능</th>
            <td className="wide">{value(record, "cognition") || "언급 없음"}</td>
          </tr>
          <tr>
            <th>대변 실수 횟수</th>
            <td>{count("stool_accidents")}</td>
          </tr>
          <tr>
            <th>소변 실수 횟수</th>
            <td>{count("urine_accidents")}</td>
          </tr>
        </tbody>
      </table>
      <h2>특이사항 (확인 사항과 조치사항)</h2>
      <table className="form-grid">
        <tbody>
          <tr>
            <td className="wide tall">
              {join([
                withCheck(record, "meal"),
                withCheck(record, "sleep"),
                withCheck(record, "discomfort"),
                withCheck(record, "medication"),
                withCheck(record, "notes"),
              ])}
            </td>
          </tr>
        </tbody>
      </table>
      <table className="form-grid sign">
        <tbody>
          <tr>
            <th>장기요양요원</th>
            <td>(서명)</td>
            <th>수급자 또는 보호자</th>
            <td>(서명)</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
