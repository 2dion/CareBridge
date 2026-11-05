"use client";

import { createContext, useContext, type ReactNode, type ComponentPropsWithoutRef } from "react";
import { useDemo } from "@/components/demo/demo-provider";
import { DEFAULT_NATIVE_LANG } from "@/lib/i18n/languages";
import type { NativeLang } from "@/lib/auth/signup";
import { nativeMessage, type MessageParams } from "@/lib/i18n/messages";

type NativeProps = ComponentPropsWithoutRef<"span"> & {
  as?: "span" | "p" | "small" | "div";
  id?: string;
  params?: MessageParams;
  /** 기록 번역은 기록을 만든 때 언어와 지금 언어가 같을 때만 보인다. */
  recordLanguage?: NativeLang;
  /** 조각을 이어 그리는 문장은 필요한 키가 하나라도 없으면 줄 전체를 숨긴다. */
  requiredIds?: readonly string[];
  /** 특정 줄의 언어를 명시할 때만 쓴다. */
  language?: NativeLang;
};

const LanguageContext = createContext<NativeLang | null>(null);

/** A2에서 고른 언어를 제목·동의 안내·오류·공통 부품까지 함께 적용한다. */
export function NativeLanguageProvider({
  language,
  children,
}: {
  language: NativeLang;
  children: ReactNode;
}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

/** 모국어 번역 한 줄. 빠진 키와 한국어 계정은 줄 자체를 그리지 않는다. */
export function useNativeLanguage(): NativeLang {
  const selected = useContext(LanguageContext);
  const demo = useDemo();
  return selected ?? demo?.real?.nativeLang ?? demo?.db.worker.nativeLang ?? DEFAULT_NATIVE_LANG;
}

export function Native({
  as: Tag = "span",
  id,
  params,
  language,
  recordLanguage,
  requiredIds,
  children,
  className = "native",
  ...props
}: NativeProps) {
  const currentLanguage = useNativeLanguage();
  const lang = language ?? currentLanguage;
  if (lang === "ko" || (recordLanguage !== undefined && recordLanguage !== lang)) return null;
  if (requiredIds?.some((key) => !nativeMessage(lang, key))) return null;
  const text = id ? nativeMessage(lang, id, params) : children;
  if (!text) return null;
  return (
    <Tag {...props} className={className} lang={lang}>
      {text}
    </Tag>
  );
}
