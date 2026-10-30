"use client";

// M5(설정): 기관 정보(읽기만), 작성자용 가입 코드 복사, AI 사용 원칙.
// 가입 코드는 실제 모드에서 기관의 join_codes(active)를 RLS로 읽기만 한다. 만들거나 끄는 것은 팀장이 DB에서 한다(로그인가입 결정 6).
// 관리자용 코드는 화면에 보이지 않는다(화면 v1.3 '가입 코드 보기'). 코드 값을 화면 코드에 두지 않는다(이슈 #119).
import { useDemo, useRoleNames } from "@/components/demo/demo-provider";
import { DeskShell, useToast } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";
import type { RoleNames } from "@/lib/demo/roles";

// 교육용 기관이면 교육생·강사(이슈 #146)
const buildPrinciples = (names: RoleNames) => [
  `AI 결과는 초안입니다. ${names.workerSubject} 확인하고 ${names.reviewer}가 승인합니다.`,
  "원문에 없는 내용은 지어내지 않습니다. 없으면 ‘언급 없음’, 애매하면 ‘확인 필요’로 남깁니다.",
  "‘확인 필요’를 모두 정해야 승인할 수 있습니다.",
  "어르신·가족 실명을 기록에 쓰지 않습니다.",
];

export default function SettingsPage() {
  return (
    <DeskShell active="settings">
      <Settings />
    </DeskShell>
  );
}

function Settings() {
  const { db, real } = useDemo()!;
  const toast = useToast();
  const careTypes = [...new Set(db.residents.map((resident) => resident.careType))]
    .map((type) => (type === "home" ? "재가" : "시설"))
    .join(" · ");
  // 실제 모드: 기관의 켜진 작성자용 코드(보통 1개). Mock 모드: 코드가 없어 자리만 보인다
  const workerCodes = real ? real.joinCodes.filter((entry) => entry.role === "worker") : [];
  // 교육용 기관이면 교육생·강사(이슈 #125·#146, 용어집 v1.0)
  const names = useRoleNames();
  const writer = names.worker;
  const principles = buildPrinciples(names);
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.show("가입 코드를 복사했어요.");
    } catch {
      toast.show("복사하지 못했어요. 코드를 직접 적어 주세요.");
    }
  };
  return (
    <>
      <header className="page-head">
        <div>
          <h1>설정</h1>
          <p>기관 정보와 가입 코드를 확인해요.</p>
        </div>
      </header>
      <div className="settings-grid">
        <section className="panel" style={{ padding: 24 }}>
          <h2 className="panel-head">기관 정보</h2>
          <dl className="kv">
            <div>
              <dt>기관 이름</dt>
              <dd>{db.worker.org}</dd>
            </div>
            <div>
              <dt>급여 종류</dt>
              <dd>{careTypes}</dd>
            </div>
            <div>
              <dt>교육용 기관</dt>
              <dd>{real ? (real.isTraining ? "예" : "아니요") : "아니요 (Mock)"} (읽기만)</dd>
            </div>
          </dl>
        </section>
        <section className="panel" style={{ padding: 24 }}>
          <h2 className="panel-head">{writer}용 가입 코드</h2>
          {!real ? (
            <div className="code-box">
              <b>Mock 모드 · 코드 없음</b>
            </div>
          ) : workerCodes.length === 0 ? (
            <div className="code-box">
              <b>켜진 코드 없음</b>
            </div>
          ) : (
            workerCodes.map((entry) => (
              <div className="code-box" key={entry.code}>
                <b>{entry.code}</b>
                <button type="button" className="dbtn sm" onClick={() => copy(entry.code)}>
                  <Icon name="copy" />
                  복사
                </button>
              </div>
            ))
          )}
          <p className="fhint">
            {!real
              ? "Supabase에 연결하면 기관의 가입 코드(join_codes)를 여기서 읽어요. Mock 모드에는 실제 코드가 없어요."
              : workerCodes.length === 0
                ? `이 기관에 켜진 ${writer}용 코드가 없어요. 팀장에게 요청하세요.`
                : `새 ${writer}은(는) 이 코드로 직접 가입해요. 코드를 만들거나 끄는 것은 팀장이 합니다. ${names.reviewer}용 코드는 화면에 보이지 않아요.`}
          </p>
        </section>
      </div>
      <section className="panel" style={{ padding: 24, marginTop: 20 }}>
        <h2 className="panel-head">AI 사용 원칙</h2>
        <ul className="check-list">
          {principles.map((line) => (
            <li key={line}>
              <Icon name="check" />
              {line}
            </li>
          ))}
        </ul>
      </section>
      {toast.node}
    </>
  );
}
