import { fmt, type Dict } from "@/lib/i18n/dict";
import { RULE_KEYS } from "./rules";

/** สรุปรอบของ tick เป็นภาษาคน (อ่านแบบป้องกันตัว: ข้อมูลเก่าอาจไม่มีบางช่อง) */
export function describeTick(t: Dict, summary: unknown): string {
  const s = summary && typeof summary === "object" ? (summary as Record<string, unknown>) : {};
  const parts: string[] = [];
  for (const k of RULE_KEYS) {
    if (!(k in s)) continue;
    const v = s[k];
    const name = (t as Record<string, string>)[`rule_${k}`] ?? k;
    parts.push(v === -1 ? `${name}: ${t.rules_off_state}` : v === -2 ? `${name}: ${t.rules_skipped}` : `${name}: ${typeof v === "number" ? v : 0}`);
  }
  if (typeof s.stopped === "string") parts.push(fmt(t.rules_stopped, { rule: (t as Record<string, string>)[`rule_${s.stopped}`] ?? s.stopped }));
  return parts.join(" · ");
}

