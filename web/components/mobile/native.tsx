"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useDemo } from "@/components/demo/demo-provider";
import { supabaseConfigured } from "@/lib/auth/session";
import type { NativeLang } from "@/lib/auth/signup";
import { nativeMessage, type MessageParams } from "@/lib/i18n/messages";

type NativeProps = ComponentPropsWithoutRef<"span"> & {
  as?: "span" | "p" | "small" | "div";
  id?: string;
  params?: MessageParams;
  /** 로그인 전에는 모국어가 정해지지 않아 vi를 명시한다. */
  language?: NativeLang;
};

/** 모국어 번역 한 줄. 빠진 키와 한국어 계정은 줄 자체를 그리지 않는다. */
export function useNativeLanguage(): NativeLang {
  const demo = useDemo();
  return demo?.real?.nativeLang ?? (supabaseConfigured() ? "ko" : "vi");
}

export function Native({
  as: Tag = "span",
  id,
  params,
  language,
  children,
  className = "native",
  ...props
}: NativeProps) {
  const currentLanguage = useNativeLanguage();
  const lang = language ?? currentLanguage;
  if (lang === "ko") return null;
  const text = id ? nativeMessage(lang, id, params) : children;
  if (!text) return null;
  return (
    <Tag {...props} className={className} lang={lang}>
      {text}
    </Tag>
  );
}
