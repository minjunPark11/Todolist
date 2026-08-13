import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Language } from "../types";
import { en } from "./en";
import { ko } from "./ko";

export type Dictionary = Record<string, string>;

const dictionaries: Record<Language, Dictionary> = { en, ko };

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

// Non-hook lookup for the rare spot that needs a translation before any
// I18nProvider ancestor exists (e.g. inline JSX/handlers in the App.tsx
// component that itself renders the Provider). Prefer useT() everywhere else.
export function translate(lang: Language, key: string, vars?: Vars): string {
  const template = dictionaries[lang][key] ?? dictionaries.en[key];
  if (template === undefined) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing translation key: "${key}"`);
    }
    return key;
  }
  return interpolate(template, vars);
}

interface I18nContextValue {
  lang: Language;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(
    () => ({ lang, t: (key: string, vars?: Vars) => translate(lang, key, vars) }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useT() must be used within an I18nProvider");
  }
  return ctx;
}
