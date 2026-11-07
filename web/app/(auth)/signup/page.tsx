"use client";

// A2(회원가입): 한 화면에서 모두 채우고 [가입하기] 한 번. 가입 코드가 기관·역할을 정한다.
// 모국어를 고르면 이 화면 전체의 병기와 가입 입력에 함께 적용한다(언어선택화면 결정).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Native, NativeLanguageProvider, useNativeLanguage } from "@/components/mobile/native";
import { nativeMessage } from "@/lib/i18n/messages";
import { useDemo } from "@/components/demo/demo-provider";
import { CapsLockNote, useCapsLock } from "@/components/mobile/caps-lock";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel } from "@/components/mobile/parts";
import { AppBar, MobileScreen } from "@/components/mobile/shell";
import { TextInput } from "@/components/mobile/text-field";
import { signIn, supabaseConfigured } from "@/lib/auth/session";
import { MIN_PASSWORD_LENGTH, type SignupError } from "@/lib/auth/signup";
import { privacySections } from "@/lib/privacy";
import { roleNamesBoth, roleNames } from "@/lib/demo/roles";

import { LanguageSelect } from "@/components/mobile/language-select";
import { DEFAULT_NATIVE_LANG, type NativeLang } from "@/lib/i18n/languages";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mock 가입 코드(시연용). 실제 코드는 join_codes 표에 있다. */
const MOCK_CODES: Record<string, "worker" | "reviewer"> = {
  "DEMO-CARE-24": "worker",
  "DEMO-STAFF-24": "reviewer",
};

type Field = "code" | "name" | "email" | "password" | "password2";

function FieldError({ ko, native }: { ko: string; native: string }) {
  return (
    <p className="form-error" role="alert">
      <Icon name="alert" />
      <span>
        <b>{ko}</b>
        <Native>{native}</Native>
      </span>
    </p>
  );
}

export default function SignupPage() {
  const [language, setLanguage] = useState<NativeLang>(DEFAULT_NATIVE_LANG);
  return (
    <NativeLanguageProvider language={language}>
      <SignupForm language={language} onLanguageChange={setLanguage} />
    </NativeLanguageProvider>
  );
}

function SignupForm({
  language,
  onLanguageChange,
}: {
  language: NativeLang;
  onLanguageChange: (language: NativeLang) => void;
}) {
  const nativeLanguage = useNativeLanguage();
  const namesBoth = roleNamesBoth(nativeLanguage);
  const router = useRouter();
  const demo = useDemo();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [show, setShow] = useState(false);
  const [agreeAi, setAgreeAi] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [moreAi, setMoreAi] = useState(false);
  const [morePrivacy, setMorePrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<SignupError | "network" | null>(null);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const caps = useCapsLock();
  const caps2 = useCapsLock();

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
    agreeAi &&
    agreePrivacy;

  const touch = (field: Field) => setTouched((prev) => ({ ...prev, [field]: true }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setServerError(null);
    let role: "worker" | "reviewer";
    let orgName: string;
    // 가입 코드의 기관이 교육용이면 가입 안내도 교육생·강사로(이슈 #146). Mock은 일반 기관
    let isTraining = false;
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
            native_lang: language,
          }),
        });
        const body = (await response.json()) as
          | { role: "worker" | "reviewer"; org_name: string; is_training: boolean }
          | { error: SignupError };
        if ("error" in body) {
          setServerError(body.error);
          setBusy(false);
          return;
        }
        role = body.role;
        orgName = body.org_name;
        isTraining = Boolean(body.is_training);
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
          role === "worker"
            ? { ...db.worker, name: name.trim(), email: email.trim(), nativeLang: language }
            : db.worker,
      }));
    }
    const login = await signIn(email.trim(), password);
    setBusy(false);
    if (!login.ok) {
      router.push("/login");
      return;
    }
    const names = roleNames(isTraining);
    const joined = encodeURIComponent(
      `${orgName} · ${role === "worker" ? names.workerAs : `${names.reviewer}로`} 가입했습니다`,
    );
    router.push(role === "worker" ? `/guide?joined=${joined}` : "/overview");
  };

  const codeError = serverError === "invalid_code";

  return (
    <MobileScreen className="auth">
      <AppBar title="회원가입" nativeId="a2.signUp" nativeAlways back="/login" />
      <form className="stack pad auth-form" onSubmit={submit} noValidate style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="code">
            가입 코드 <Native id="a2.code" />
          </label>
          <TextInput
            id="code"
            className={`input ${codeError ? "invalid" : ""}`}
            value={code}
            onValueChange={(next) => {
              setCode(next.toUpperCase());
              if (codeError) setServerError(null);
            }}
            autoCapitalize="characters"
            autoComplete="off"
          />
          {codeError ? (
            <FieldError
              ko={`가입 코드가 맞지 않아요. ${namesBoth.reviewer}에게 다시 확인하세요.`}
              native={nativeMessage(nativeLanguage, "a2.error.code", {
                reviewer: namesBoth.reviewerNative,
              })}
            />
          ) : (
            <small className="hint-line">
              {/* 로그인 전이라 어느 기관인지 몰라 '관리자(강사)'로 함께 쓴다(용어집 v1.0) */}
              {namesBoth.reviewer}에게 받은 코드
              {nativeMessage(nativeLanguage, "a2.codeHint", {
                reviewer: namesBoth.reviewerNative,
              }) && " · "}
              <Native id="a2.codeHint" params={{ reviewer: namesBoth.reviewerNative }} />
            </small>
          )}
        </div>
        <div className="field">
          <label htmlFor="name">
            이름 <Native id="a2.name" />
          </label>
          <TextInput
            id="name"
            className="input"
            value={name}
            onValueChange={setName}
            autoComplete="nickname"
          />
          <small className="hint-line">
            화면에 보일 이름 (별명도 돼요)
            {nativeMessage(nativeLanguage, "a2.displayName") && " · "}
            <Native id="a2.displayName" />
          </small>
        </div>
        <div className="field">
          <label htmlFor="email">
            이메일 <Native id="a2.email" />
          </label>
          <TextInput
            id="email"
            className={`input ${badEmail || serverError === "invalid_email" || serverError === "email_taken" ? "invalid" : ""}`}
            type="email"
            value={email}
            onValueChange={(next) => {
              setEmail(next);
              if (serverError === "email_taken" || serverError === "invalid_email")
                setServerError(null);
            }}
            onBlur={() => touch("email")}
            autoComplete="email"
          />
          {(badEmail || serverError === "invalid_email") && (
            <FieldError
              ko="이메일 형식이 맞지 않습니다."
              native={nativeMessage(nativeLanguage, "a2.error.email")}
            />
          )}
          {serverError === "email_taken" && (
            <>
              <FieldError
                ko="이미 가입한 이메일입니다."
                native={nativeMessage(nativeLanguage, "a2.error.emailTaken")}
              />
              <Link className="text-link" href="/login" style={{ textAlign: "left" }}>
                로그인하러 가기
                {nativeMessage(nativeLanguage, "a2.goToLogin") && " · "}
                <Native id="a2.goToLogin" />
              </Link>
            </>
          )}
        </div>
        <div className="field">
          <label htmlFor="password">
            비밀번호 <Native id="a2.password" />
          </label>
          <div className="pw-wrap">
            <TextInput
              id="password"
              className={`input ${shortPw || serverError === "weak_password" ? "invalid" : ""}`}
              type={show ? "text" : "password"}
              value={password}
              onValueChange={setPassword}
              autoComplete="new-password"
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
          {shortPw || serverError === "weak_password" ? (
            <FieldError
              ko="비밀번호는 8자 이상이어야 합니다."
              native={nativeMessage(nativeLanguage, "a2.error.password")}
            />
          ) : (
            <small className="hint-line">
              8자 이상
              {nativeMessage(nativeLanguage, "a2.passwordHint") && " · "}
              <Native id="a2.passwordHint" />
            </small>
          )}
        </div>
        <div className="field">
          <label htmlFor="password2">
            비밀번호 다시 쓰기 <Native id="a2.repeatPassword" />
          </label>
          <div className="pw-wrap">
            <TextInput
              id="password2"
              className={`input ${mismatch ? "invalid" : ""}`}
              type={show ? "text" : "password"}
              value={password2}
              onValueChange={setPassword2}
              autoComplete="new-password"
              {...caps2.props}
            />
          </div>
          <CapsLockNote on={caps2.on} />
          {mismatch && (
            <FieldError
              ko="두 비밀번호가 다릅니다."
              native={nativeMessage(nativeLanguage, "a2.error.mismatch")}
            />
          )}
        </div>
        <div className="field">
          <LanguageSelect
            id="native-lang"
            value={language}
            onChange={onLanguageChange}
            label="모국어"
          />
        </div>
        <div className="card consent">
          <label className="consent-row">
            <input
              type="checkbox"
              checked={agreeAi}
              onChange={(event) => setAgreeAi(event.target.checked)}
            />
            <span>
              <b>[필수] AI 사용 원칙에 동의합니다.</b>
              <Native id="a2.agreeAi" />
            </span>
          </label>
          {moreAi && (
            <div id="ai-consent-details" className="consent-details">
              <p>
                AI 기록은 초안이며, 관리자(강사)의 승인을 거쳐 공식 기록이 됩니다.
                <Native id="a2.aiDraft" />
              </p>
              <p>
                어르신과 가족의 실명은 기록하지 않습니다.
                <Native id="a2.noRealNames" />
              </p>
            </div>
          )}
          <button
            type="button"
            className="text-link consent-toggle"
            onClick={() => setMoreAi(!moreAi)}
            aria-expanded={moreAi}
            aria-controls="ai-consent-details"
          >
            {moreAi ? "내용 접기" : "내용 보기 ›"}
          </button>
        </div>
        <div className="card consent">
          <label className="consent-row">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(event) => setAgreePrivacy(event.target.checked)}
            />
            <span>
              <b>[필수] 개인정보 수집·이용에 동의합니다.</b>
              <Native id="a2.agreePrivacy" />
            </span>
          </label>
          {morePrivacy && (
            <table id="privacy-consent-details" className="consent-table">
              <caption className="sr-only">
                개인정보 수집·이용 안내
                {nativeMessage(nativeLanguage, "a2.privacyCaption") && " · "}
                <Native id="a2.privacyCaption" />
              </caption>
              <tbody>
                {privacySections(nativeLanguage).map((section) => (
                  <tr key={section.ko}>
                    <th scope="row">
                      {section.ko}
                      <Native>{section.native}</Native>
                    </th>
                    <td>
                      {section.body}
                      <Native>{section.bodyNative}</Native>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            type="button"
            className="text-link consent-toggle"
            onClick={() => setMorePrivacy(!morePrivacy)}
            aria-expanded={morePrivacy}
            aria-controls="privacy-consent-details"
          >
            {morePrivacy ? "내용 접기" : "내용 보기 ›"}
          </button>
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
              <Native id={serverError === "network" ? "a1.error.network" : "a2.error.signup"} />
            </div>
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          <BtnLabel ko={busy ? "가입하는 중" : "가입하기"} nativeId="a2.signUp" always />
        </button>
        {!supabaseConfigured() && (
          <p className="foot-note" style={{ margin: "0 0 20px" }}>
            시연(Mock) 가입 코드: DEMO-CARE-24 (작성자), DEMO-STAFF-24 (관리자)
          </p>
        )}
      </form>
    </MobileScreen>
  );
}
