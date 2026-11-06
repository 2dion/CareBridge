"use client";

import { useState } from "react";
import { useDemo } from "@/components/demo/demo-provider";
import { LanguageSelect } from "@/components/mobile/language-select";
import { Native, useNativeLanguage } from "@/components/mobile/native";
import { AppBar, Loading, MobileScreen } from "@/components/mobile/shell";
import { type NativeLang } from "@/lib/i18n/languages";
import { nativeMessage } from "@/lib/i18n/messages";

export default function LanguagePage() {
  const demo = useDemo();
  const language = useNativeLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!demo) return <Loading tab="me" />;

  const save = async (next: NativeLang) => {
    if (busy || next === language) return;
    setBusy(true);
    setError(false);
    try {
      if (demo.real) {
        const result = await demo.real.actions.setProfile({ nativeLang: next });
        if (!result.ok) {
          setError(true);
          return;
        }
      } else {
        demo.update((db) => ({ ...db, worker: { ...db.worker, nativeLang: next } }));
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileScreen tab="me">
      <AppBar title="언어" nativeId="language.title" back="/me" />
      <section className="stack pad" style={{ gap: 16 }} aria-busy={busy}>
        <div className="field">
          <LanguageSelect
            id="profile-language"
            label="모국어"
            value={language}
            onChange={(next) => void save(next)}
            disabled={busy}
          />
        </div>
        <div>
          <p>고르면 바로 저장돼요. 한국어를 고르면 번역 줄이 보이지 않아요.</p>
          <Native as="p" id="language.description" />
        </div>
        <div>
          <p>이전 모국어로 만든 기록은 한국어만 보여요.</p>
          <Native as="p" id="language.oldRecords" />
        </div>
        {busy && (
          <p role="status">
            저장하는 중이에요.
            <Native id="language.saving" />
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            언어를 저장하지 못했어요. 연결을 확인하고 다시 골라 주세요.
            <Native>{nativeMessage(language, "language.error")}</Native>
          </p>
        )}
      </section>
    </MobileScreen>
  );
}
