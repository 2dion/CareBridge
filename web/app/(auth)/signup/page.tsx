"use client";

// A2(회원가입, 피그마 M33·M34): 한 화면에서 모두 채우고 [가입하기] 한 번. 가입 코드가 기관·역할을 정한다.
// 로그인 전이라 늘 병기. MVP는 병기 모드 하나라 모국어 칸을 숨기고 vi를 보낸다(병기모드우선 결정).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel } from "@/components/mobile/parts";
import { AppBar, MobileScreen } from "@/components/mobile/shell";
import { signIn, supabaseConfigured } from "@/lib/auth/session";
import { MIN_PASSWORD_LENGTH, type SignupError } from "@/lib/auth/signup";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mock 가입 코드(시연용). 실제 코드는 join_codes 표에 있다. */
const MOCK_CODES: Record<string, "worker" | "reviewer"> = {
  "DEMO-CARE-24": "worker",
  "DEMO-STAFF-24": "reviewer",
};

type Field = "code" | "name" | "email" | "password" | "password2";

function FieldError({ ko, vi }: { ko: string; vi: string }) {
  return (
    <p className="form-error" role="alert">
      <Icon name="alert" />
      <span>
        <b>{ko}</b>
        <span className="vi">{vi}</span>
      </span>
    </p>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const demo = useDemo();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<SignupError | "network" | null>(null);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});

  const normalizedCode = code.toUpperCase().replace(/\s+/g, "");
  const shortPw = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = password2.length > 0 && password !== password2;
  const badEmail = touched.email && email.trim() !== "" && !EMAIL_PATTERN.test(email.trim());
  const ready =
    normalizedCode &&
    name.trim() &&
    EMAIL_PATTERN.test(email.trim()) &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === password2 &&
    agree;

  const touch = (field: Field) => setTouched((prev) => ({ ...prev, [field]: true }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setServerError(null);
    let role: "worker" | "reviewer";
    let orgName: string;
    if (supabaseConfigured()) {
      try {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: normalizedCode,
            name: name.trim(),
            email: email.trim(),
            password,
            native_lang: "vi",
          }),
        });
        const body = (await response.json()) as
          { role: "worker" | "reviewer"; org_name: string } | { error: SignupError };
        if ("error" in body) {
          setServerError(body.error);
          setBusy(false);
          return;
        }
        role = body.role;
        orgName = body.org_name;
      } catch {
        setServerError("network");
        setBusy(false);
        return;
      }
    } else {
      const mock = MOCK_CODES[normalizedCode];
      if (!mock) {
        setServerError("invalid_code");
        setBusy(false);
        return;
      }
      role = mock;
      orgName = demo?.db.worker.org ?? "케어브릿지 데모 요양센터";
      demo?.update((db) => ({
        ...db,
        onboarded: false,
        worker:
          role === "worker" ? { ...db.worker, name: name.trim(), email: email.trim() } : db.worker,
      }));
    }
    const login = await signIn(email.trim(), password);
    setBusy(false);
    if (!login.ok) {
      router.push("/login");
      return;
    }
    const joined = encodeURIComponent(
      `${orgName} · ${role === "worker" ? "작성자" : "담당자"}로 가입했습니다`,
    );
    router.push(role === "worker" ? `/guide?joined=${joined}` : "/legacy");
  };

  const codeError = serverError === "invalid_code";

  return (
    <MobileScreen className="auth">
      <AppBar title="회원가입" vi="Đăng ký" viAlways back="/login" />
      <form className="stack pad auth-form" onSubmit={submit} noValidate style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="code">
            가입 코드 <span className="vi">Mã đăng ký</span>
          </label>
          <input
            id="code"
            className={`input ${codeError ? "invalid" : ""}`}
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              if (codeError) setServerError(null);
            }}
            autoCapitalize="characters"
            autoComplete="off"
          />
          {codeError ? (
            <FieldError
              ko="가입 코드가 맞지 않습니다. 담당자에게 다시 확인하세요."
              vi="Mã không đúng. Hãy hỏi lại người quản lý."
            />
          ) : (
            <small className="hint-line">
              담당자(교육원은 강사)에게 받은 코드 ·{" "}
              <span className="vi">Mã do người quản lý cấp</span>
            </small>
          )}
        </div>
        <div className="field">
          <label htmlFor="name">
            이름 <span className="vi">Tên</span>
          </label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="nickname"
          />
          <small className="hint-line">
            화면에 보일 이름 (별명도 돼요) · <span className="vi">Tên hiển thị</span>
          </small>
        </div>
        <div className="field">
          <label htmlFor="email">
            이메일 <span className="vi">Email</span>
          </label>
          <input
            id="email"
            className={`input ${badEmail || serverError === "invalid_email" || serverError === "email_taken" ? "invalid" : ""}`}
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (serverError === "email_taken" || serverError === "invalid_email")
                setServerError(null);
            }}
            onBlur={() => touch("email")}
            autoComplete="email"
          />
          {(badEmail || serverError === "invalid_email") && (
            <FieldError ko="이메일 형식이 맞지 않습니다." vi="Email không đúng định dạng." />
          )}
          {serverError === "email_taken" && (
            <>
              <FieldError ko="이미 가입한 이메일입니다." vi="Email này đã được đăng ký." />
              <Link className="text-link" href="/login" style={{ textAlign: "left" }}>
                로그인하러 가기 · Đi đến đăng nhập
              </Link>
            </>
          )}
        </div>
        <div className="field">
          <label htmlFor="password">
            비밀번호 <span className="vi">Mật khẩu</span>
          </label>
          <div className="pw-wrap">
            <input
              id="password"
              className={`input ${shortPw || serverError === "weak_password" ? "invalid" : ""}`}
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="eye"
              aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
              onClick={() => setShow(!show)}
            >
              <Icon name={show ? "eyeOff" : "eye"} />
            </button>
          </div>
          {shortPw || serverError === "weak_password" ? (
            <FieldError ko="비밀번호는 8자 이상이어야 합니다." vi="Mật khẩu cần ít nhất 8 ký tự." />
          ) : (
            <small className="hint-line">
              8자 이상 · <span className="vi">Ít nhất 8 ký tự</span>
            </small>
          )}
        </div>
        <div className="field">
          <label htmlFor="password2">
            비밀번호 다시 쓰기 <span className="vi">Nhập lại</span>
          </label>
          <div className="pw-wrap">
            <input
              id="password2"
              className={`input ${mismatch ? "invalid" : ""}`}
              type={show ? "text" : "password"}
              value={password2}
              onChange={(event) => setPassword2(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          {mismatch && <FieldError ko="두 비밀번호가 다릅니다." vi="Hai mật khẩu không khớp." />}
        </div>
        <div className="card consent">
          <label className="consent-row">
            <input
              type="checkbox"
              checked={agree}
              onChange={(event) => setAgree(event.target.checked)}
            />
            <span>
              <b>AI 결과는 초안이며 담당자가 승인합니다.</b>
              <b>어르신·가족 실명을 쓰지 않습니다.</b>
              <span className="vi">
                Kết quả AI là bản nháp, người quản lý duyệt. Không dùng tên thật.
              </span>
            </span>
          </label>
          <button
            type="button"
            className="text-link"
            style={{ textAlign: "left" }}
            onClick={() => setMore(!more)}
            aria-expanded={more}
          >
            AI 사용 원칙·개인정보 안내 {more ? "접기" : "펼치기"}
          </button>
          {more && (
            <div style={{ fontSize: 13, color: "var(--color-sub)", display: "grid", gap: 6 }}>
              <p>
                AI가 말한 내용을 항목별 초안으로 정리하고, 작성자가 확인한 뒤 담당자가 승인해야
                기록이 끝나요. 말하지 않은 내용은 지어내지 않아요.
                <span className="vi" style={{ display: "block" }}>
                  AI soạn bản nháp, người ghi chép kiểm tra, người phụ trách duyệt.
                </span>
              </p>
              <p>
                이름, 언어 설정, 기록 내용만 모으고 우리 기관 사람만 볼 수 있게 보관해요. 녹음은
                글자로 바꾼 뒤 지워요.
                <span className="vi" style={{ display: "block" }}>
                  Chỉ thu thập tên, ngôn ngữ và nội dung ghi chép; chỉ người trong cơ sở xem được.
                </span>
              </p>
            </div>
          )}
        </div>
        {(serverError === "signup_failed" ||
          serverError === "invalid_input" ||
          serverError === "network") && (
          <div className="form-error box" role="alert">
            <Icon name="alert" />
            <div>
              <b>
                {serverError === "network"
                  ? "인터넷 연결을 확인하세요."
                  : "가입 중 문제가 생겼어요. 다시 시도해 주세요."}
              </b>
              <span className="vi">
                {serverError === "network"
                  ? "Hãy kiểm tra kết nối Internet."
                  : "Có lỗi khi đăng ký. Hãy thử lại."}
              </span>
            </div>
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          <BtnLabel ko={busy ? "가입하는 중" : "가입하기"} vi="Đăng ký" always />
        </button>
        {!supabaseConfigured() && (
          <p className="foot-note" style={{ margin: "0 0 20px" }}>
            시연(Mock) 가입 코드: DEMO-CARE-24 (작성자), DEMO-STAFF-24 (담당자)
          </p>
        )}
      </form>
    </MobileScreen>
  );
}
