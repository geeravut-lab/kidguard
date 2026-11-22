"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fmt, type Dict, type DictKey, type Lang } from "./dict";

type Ctx = { lang: Lang; t: Dict };
const I18nContext = createContext<Ctx | null>(null);

/** server ส่งพจนานุกรม "ภาษาเดียว" ลงมา (ไม่ส่งทั้งสองภาษาไป browser) */
export function I18nProvider({ lang, dict, children }: { lang: Lang; dict: Dict; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: dict }), [lang, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT() {
  const { t } = useI18n();
  return (key: DictKey, vars?: Record<string, string | number>) => fmt(t[key], vars);
}
