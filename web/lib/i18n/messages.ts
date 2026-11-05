import type { NativeLang } from "@/lib/auth/signup";
import { zh } from "./messages/zh";
import { mn } from "./messages/mn";
import { en } from "./messages/en";
import { vi } from "./messages/vi";

export type MessageId = keyof typeof vi;
export type MessageParams = Readonly<Record<string, string | number>>;

const messages: Partial<Record<NativeLang, Readonly<Record<string, string>>>> = { vi, zh, mn, en };

/** 없는 언어·키·매개변수는 한국어만 보이도록 빈값을 돌려준다. */
export function nativeMessage(lang: NativeLang, id: string, params: MessageParams = {}): string {
  const template = messages[lang]?.[id];
  if (!template) return "";
  let missing = false;
  const text = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!Object.hasOwn(params, key) || params[key] === "") {
      missing = true;
      return "";
    }
    return String(params[key]);
  });
  return missing ? "" : text;
}
