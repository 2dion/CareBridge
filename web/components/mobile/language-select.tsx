"use client";

import { LANGUAGES, parseSelectableLang, type NativeLang } from "@/lib/i18n/languages";
import { Native } from "./native";

/** A2·W5는 같은 켜진 언어 목록을 쓴다. 한국어는 번역 없음이다. */
export function LanguageSelect({
  id,
  value,
  onChange,
  label,
  disabled = false,
}: {
  id: string;
  value: NativeLang;
  onChange: (language: NativeLang) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <>
      <label htmlFor={id}>
        {label} <Native id="language.label" />
      </label>
      <select
        id={id}
        className="input"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const language = parseSelectableLang(event.target.value);
          if (language) onChange(language);
        }}
      >
        {!LANGUAGES.some((language) => language.code === value && language.enabled) && (
          <option value={value} disabled>
            {LANGUAGES.find((language) => language.code === value)?.nameNative}
          </option>
        )}
        {LANGUAGES.filter((language) => language.enabled || language.code === "ko").map(
          (language) => (
            <option key={language.code} value={language.code} lang={language.code}>
              {language.code === "ko" ? "한국어(번역 없음)" : language.nameNative}
            </option>
          ),
        )}
      </select>
    </>
  );
}
