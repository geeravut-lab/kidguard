// พจนานุกรมเดียวสำหรับทั้งระบบ (ไม่มี import React — ใช้ได้ทั้ง server/client/metadata)
// ไทยเป็นต้นฉบับ: key ที่ขาด/เกินในภาษาอังกฤษ = คอมไพล์ไม่ผ่าน (ดู docs/I18N-KNOWLEDGE.md)
// ชื่อแอปเขียนด้วยชื่อเริ่มต้น "KidGuard" เสมอ แล้วสลับตอนอ่านด้วย applyBrandNames

import { coreTh, coreEn } from "./messages/core";
import { authTh, authEn } from "./messages/auth";
import { parentTh, parentEn } from "./messages/parent";
import { staffTh, staffEn } from "./messages/staff";
import { pickupTh, pickupEn } from "./messages/pickup";
import { notifyTh, notifyEn } from "./messages/notify";
import { adminTh, adminEn } from "./messages/admin";
import { safetyTh, safetyEn } from "./messages/safety";

export const th = { ...coreTh, ...authTh, ...parentTh, ...staffTh, ...pickupTh, ...notifyTh, ...adminTh, ...safetyTh } as const;

export type Dict = { [K in keyof typeof th]: string };

export const en = { ...coreEn, ...authEn, ...parentEn, ...staffEn, ...pickupEn, ...notifyEn, ...adminEn, ...safetyEn } satisfies Dict;

export type Lang = "th" | "en";
export const LANGS: readonly Lang[] = ["th", "en"] as const;
export const DEFAULT_LANG: Lang = "th";
export const DICTS: Record<Lang, Dict> = { th, en };
export type DictKey = keyof typeof th;

export function isLang(v: unknown): v is Lang {
  return v === "th" || v === "en";
}

/** แทนที่ {name} ด้วยค่า; placeholder ที่ไม่มีค่าคงไว้เหมือนเดิม */
export function fmt(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
