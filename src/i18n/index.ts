// Tiny i18n: the English text is the key, other languages map it to a translation.
// Missing translations fall back to English. `npm test` checks every t("…") literal
// in src/ has a Catalan entry.

import { Fragment, createElement, type ReactNode } from "react";
import { ca } from "./ca";

export type Lang = "en" | "ca";
export type LangSetting = "system" | Lang;

export const LANGUAGES: { value: LangSetting; label: string }[] = [
  { value: "system", label: "System" },
  { value: "en", label: "English" },
  { value: "ca", label: "Català" },
];

const DICTS: Record<Lang, Record<string, string>> = { en: {}, ca };
let current: Lang = "en";

export function resolveLang(setting: LangSetting): Lang {
  if (setting !== "system") return setting;
  return navigator.language.toLowerCase().startsWith("ca") ? "ca" : "en";
}

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
  window.platinum?.setLanguage(lang);
}

export const getLang = () => current;

type Vars = Record<string, string | number>;

/** Marks a string for translation without translating it (for tables translated later with t()). */
export const N_ = <T extends string>(s: T) => s;

/** Translate `key`, filling `{name}` placeholders from `vars`. */
export function t(key: string, vars?: Vars): string {
  const s = DICTS[current][key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Like t(), but placeholders may be React nodes (links, <code>, <b>…). */
export function tx(key: string, vars: Record<string, ReactNode>): ReactNode {
  const s = DICTS[current][key] ?? key;
  return s.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return createElement(Fragment, { key: i }, m && m[1] in vars ? vars[m[1]] : part);
  });
}
