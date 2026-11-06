import type { NativeLang } from "@/lib/auth/signup";
import { zh } from "./messages/zh";
import { mn } from "./messages/mn";
import { en } from "./messages/en";
import { vi } from "./messages/vi";

export type MessageId = keyof typeof vi;
export type MessageParams = Readonly<Record<string, string | number>>;

const messages: Partial<Record<NativeLang, Readonly<Record<string, string>>>> = { vi, zh, mn, en };

/**
 * 없는 언어·키·매개변수는 한국어만 보이도록 빈값을 돌려준다.
 * {Reviewer}처럼 첫 글자가 대문자인 자리는 같은 이름(reviewer)의 값을 문장 첫머리용으로 대문자로 시작한다.
 * 문장 안 어느 자리에 이름이 오는지는 언어마다 달라서, 넘기는 쪽은 소문자 값만 넘기고 번역문이 고른다(이슈 #349).
 */
export function nativeMessage(lang: NativeLang, id: string, params: MessageParams = {}): string {
  const template = messages[lang]?.[id];
  if (!template) return "";
  let missing = false;
  const text = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const base = key.charAt(0).toLowerCase() + key.slice(1);
    const name = Object.hasOwn(params, key) ? key : base;
    if (!Object.hasOwn(params, name) || params[name] === "") {
      missing = true;
      return "";
    }
    const value = String(params[name]);
    return name === key ? value : value.charAt(0).toUpperCase() + value.slice(1);
  });
  return missing ? "" : text;
}
