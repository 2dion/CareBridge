"use client";

// A1(로그인): 이메일·비밀번호. 로그인 전이라 한국어 아래 베트남어를 늘 보인다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Native } from "@/components/mobile/native";
import { nativeMessage } from "@/lib/i18n/messages";
import { useDemo } from "@/components/demo/demo-provider";
import { Art } from "@/components/mobile/art";
import { CapsLockNote, useCapsLock } from "@/components/mobile/caps-lock";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel } from "@/components/mobile/parts";
import { MobileScreen } from "@/components/mobile/shell";
import { TextInput } from "@/components/mobile/text-field";
import { type SignInResult, signIn, supabaseConfigured } from "@/lib/auth/session";
import { ROLE_NAMES_BOTH } from "@/lib/demo/roles";

// 로그인 전이라 어느 기관인지 모르므로 '관리자(강사)'로 함께 쓴다(이슈 #146, 용어집 v1.0)
const errors: Record<
  Exclude<SignInResult, { ok: true }>["reason"],
  { ko: string; native: string }
> = {
  wrong: {
    ko: "이메일 또는 비밀번호가 맞지 않습니다.",
    native: nativeMessage("vi", "a1.error.wrong"),
  },
  no_profile: {
    ko: `계정 준비가 아직 끝나지 않았어요. ${ROLE_NAMES_BOTH.reviewer}에게 질문하세요.`,
    native: nativeMessage("vi", "a1.error.noProfile", { reviewer: ROLE_NAMES_BOTH.reviewerNative }),
  },
  network: { ko: "인터넷 연결을 확인하세요.", native: nativeMessage("vi", "a1.error.network") },
};

export default function LoginPage() {
  const router = useRouter();
  const demo = useDemo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof errors | null>(null);
  const caps = useCapsLock();

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
      router.push("/overview");
      return;
    }
    const onboarded = supabaseConfigured() ? result.onboarded : Boolean(demo?.db.onboarded);
    router.push(onboarded ? "/today" : "/guide");
  };

  return (
    <MobileScreen className="auth">
      <div className="stack" style={{ alignItems: "center", marginTop: 48 }}>
        {/* 한 줄 소개는 A0(스플래시)에서만 보인다(이슈 #104) */}
        <Art name="logo" width={150} priority alt="케어브릿지" />
      </div>
      <form className="stack pad auth-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">
            이메일 <Native id="a1.email" language="vi" />
          </label>
          <TextInput
            id="email"
            className={`input ${error === "wrong" ? "invalid" : ""}`}
            type="email"
            autoComplete="email"
            value={email}
            onValueChange={setEmail}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">
            비밀번호 <Native id="a1.password" language="vi" />
          </label>
          <div className="pw-wrap">
            <TextInput
              id="password"
              className={`input ${error === "wrong" ? "invalid" : ""}`}
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onValueChange={setPassword}
              required
              {...caps.props}
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
          <CapsLockNote on={caps.on} />
        </div>
        {error && (
          <div className="form-error box" role="alert">
            <Icon name="alert" />
            <div>
              <b>{errors[error].ko}</b>
              <Native language="vi">{errors[error].native}</Native>
            </div>
          </div>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !email.trim() || !password}
        >
          <BtnLabel ko={busy ? "로그인 중" : "로그인"} nativeId="a1.signIn" always />
        </button>
        {error === "network" && (
          <p className="center" style={{ fontSize: 13 }}>
            다시 시도해 주세요. 쓴 이메일은 그대로 있어요.
          </p>
        )}
        <div className="auth-links">
          <Link href="/signup">
            <b>회원가입</b>
            <Native id="a1.signUp" language="vi" />
          </Link>
        </div>
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
