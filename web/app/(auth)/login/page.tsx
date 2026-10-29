"use client";

// A1(로그인): 이메일·비밀번호. 로그인 전이라 한국어 아래 베트남어를 늘 보인다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel } from "@/components/mobile/parts";
import { MobileScreen } from "@/components/mobile/shell";
import { type SignInResult, signIn, supabaseConfigured } from "@/lib/auth/session";

const errors: Record<Exclude<SignInResult, { ok: true }>["reason"], { ko: string; vi: string }> = {
  wrong: { ko: "이메일 또는 비밀번호가 맞지 않습니다.", vi: "Email hoặc mật khẩu không đúng." },
  no_profile: {
    ko: "계정 준비가 끝나지 않았습니다. 관리자에게 문의하세요.",
    vi: "Tài khoản chưa sẵn sàng. Hãy hỏi người quản lý.",
  },
  network: { ko: "인터넷 연결을 확인하세요.", vi: "Hãy kiểm tra kết nối Internet." },
};

export default function LoginPage() {
  const router = useRouter();
  const demo = useDemo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof errors | null>(null);
  const [forgot, setForgot] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    if (result.role === "reviewer") {
      router.push("/review");
      return;
    }
    const onboarded = supabaseConfigured() ? result.onboarded : Boolean(demo?.db.onboarded);
    router.push(onboarded ? "/today" : "/guide");
  };

  return (
    <MobileScreen className="auth">
      <div className="stack" style={{ alignItems: "center", marginTop: 48 }}>
        <Art name="logo" width={150} priority alt="케어브릿지" />
        <p style={{ marginTop: 14, fontSize: 16, color: "var(--color-sub)" }}>
          말로 남기고, 확인만 하면 되는 돌봄 기록
        </p>
        <span className="vi" style={{ fontSize: 13 }}>
          Ghi chép chăm sóc bằng giọng nói
        </span>
      </div>
      <form className="stack pad auth-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">
            이메일 <span className="vi">Email</span>
          </label>
          <input
            id="email"
            className={`input ${error === "wrong" ? "invalid" : ""}`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">
            비밀번호 <span className="vi">Mật khẩu</span>
          </label>
          <div className="pw-wrap">
            <input
              id="password"
              className={`input ${error === "wrong" ? "invalid" : ""}`}
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
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
        </div>
        {error && (
          <div className="form-error box" role="alert">
            <Icon name="alert" />
            <div>
              <b>{errors[error].ko}</b>
              <span className="vi">{errors[error].vi}</span>
            </div>
          </div>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !email.trim() || !password}
        >
          <BtnLabel ko={busy ? "로그인 중" : "로그인"} vi="Đăng nhập" always />
        </button>
        {error === "network" && (
          <p className="center" style={{ fontSize: 13 }}>
            다시 시도해 주세요. 쓴 이메일은 그대로 있어요.
          </p>
        )}
        <div className="auth-links">
          <Link href="/signup">
            <b>회원가입</b>
            <span className="vi">Đăng ký</span>
          </Link>
          <button type="button" onClick={() => setForgot(!forgot)} aria-expanded={forgot}>
            <b>비밀번호를 잊었어요</b>
            <span className="vi">Quên mật khẩu</span>
          </button>
        </div>
        {forgot && (
          <p className="gray-box" role="status">
            관리자에게 비밀번호를 다시 정해 달라고 요청하세요.
            <span className="vi" style={{ display: "block" }}>
              Hãy nhờ người quản lý đặt lại mật khẩu.
            </span>
          </p>
        )}
        {!supabaseConfigured() && (
          <p className="foot-note" style={{ margin: 0 }}>
            시연(Mock): 아무 이메일과 8자 이상 비밀번호로 들어가요. ‘reviewer’로 시작하는 이메일은
            관리자예요.
          </p>
        )}
      </form>
      <p
        className="center"
        style={{ marginTop: "auto", padding: 20, fontSize: 12, color: "var(--color-muted)" }}
      >
        © CareBridge
      </p>
    </MobileScreen>
  );
}
