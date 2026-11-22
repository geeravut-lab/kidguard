import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LANG, DICTS, isLang, type Dict, type Lang } from "./dict";
import { applyBrandNames, DEFAULT_BRAND, type Brand } from "@/lib/brand/brand";

export const LANG_COOKIE = "kg_lang";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

const cache = new Map<string, Dict>();

/** พจนานุกรมภาษาเดียวที่สลับชื่อแบรนด์แล้ว (cache ต่อภาษา+ชื่อ) */
export function brandedDict(lang: Lang, brand: Brand = DEFAULT_BRAND): Dict {
  const key = `${lang}|${lang === "th" ? brand.name_th : brand.name_en}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = DICTS[lang];
  const out = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, applyBrandNames(v, brand, lang)])) as Dict;
  cache.set(key, out);
  return out;
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: brandedDict(lang) };
}
