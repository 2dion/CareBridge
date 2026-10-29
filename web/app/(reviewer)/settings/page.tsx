"use client";

// R5(설정): 기관 정보(읽기만), 작성자용 가입 코드 복사, AI 사용 원칙.
// 가입 코드를 만들거나 끄는 것은 팀장이 DB에서 한다(로그인가입 결정). 관리자용 코드는 화면에 보이지 않는다.
import { useDemo } from "@/components/demo/demo-provider";
import { DeskShell, useToast } from "@/components/desk/shell";
import { Icon } from "@/components/mobile/icon";

const WORKER_CODE = "DEMO-CARE-24";

const principles = [
  "AI 결과는 초안입니다. 작성자가 확인하고 관리자가 승인합니다.",
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
  const { db } = useDemo()!;
  const toast = useToast();
  const careTypes = [...new Set(db.residents.map((resident) => resident.careType))]
    .map((type) => (type === "home" ? "재가" : "시설"))
    .join(" · ");
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
              <dd>아니요 (읽기만)</dd>
            </div>
          </dl>
        </section>
        <section className="panel" style={{ padding: 24 }}>
          <h2 className="panel-head">작성자용 가입 코드</h2>
          <div className="code-box">
            <b>{WORKER_CODE}</b>
            <button
              type="button"
              className="dbtn sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(WORKER_CODE);
                  toast.show("가입 코드를 복사했어요.");
                } catch {
                  toast.show("복사하지 못했어요. 코드를 직접 적어 주세요.");
                }
              }}
            >
              <Icon name="copy" />
              복사
            </button>
          </div>
          <p className="fhint">
            새 작성자는 이 코드로 직접 가입해요. 코드를 만들거나 끄는 것은 팀장이 합니다. 관리자용
            코드는 화면에 보이지 않아요.
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
