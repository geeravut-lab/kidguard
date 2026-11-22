import "server-only";
import { randomUUID } from "node:crypto";
import type { Tone } from "@/config/line-colors";
import { brandedDict } from "@/lib/i18n/server";
import type { Dict, Lang } from "@/lib/i18n/dict";
import { pushNoticeToUser, type PushOutcome } from "@/lib/line/service";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type NotifyInput = {
  userId: string;
  schoolId: string | null;
  kind: Tone;
  title: string;
  body?: string;
  fields?: { label: string; value: string }[];
  link?: string;
  /** กันแจ้งซ้ำ: เหตุการณ์เดียวบอกครั้งเดียวต่อคน (unique ต่อ user) */
  dedupeKey?: string;
};

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://kidguards.vercel.app").replace(/\/+$/, "");

export async function langOf(userId: string): Promise<Lang> {
  const { data } = await supabaseAdmin().from("profiles").select("lang").eq("id", userId).maybeSingle();
  return data?.lang === "en" ? "en" : "th";
}
export async function dictFor(userId: string): Promise<{ lang: Lang; t: Dict }> {
  const lang = await langOf(userId);
  return { lang, t: brandedDict(lang) };
}

/**
 * จุดส่งแจ้งเตือนจุดเดียว: เขียนกล่องแจ้งเตือนในแอป (ปลุกหน้าจอผ่าน trigger) แล้วส่ง LINE ถ้าผูกไว้
 * ไม่เคย throw (เหตุการณ์หลักห้องล้มเพราะแจ้งเตือน) · เหตุการณ์เดียวบอกครั้งเดียวด้วย dedupeKey
 */
export async function notifyUser(i: NotifyInput, deps: { fetchImpl?: typeof fetch } = {}): Promise<{ inApp: boolean; line: PushOutcome }> {
  try {
    const id = randomUUID();
    const { error } = await supabaseAdmin().from("app_notifications").insert({
      id, user_id: i.userId, school_id: i.schoolId, kind: i.kind, title: i.title.slice(0, 120), body: i.body?.slice(0, 400) ?? null,
      fields: (i.fields ?? []).slice(0, 8), link: i.link ?? null, dedupe_key: i.dedupeKey ?? null,
    });
    if (error) {
      if (error.code !== "23505") console.error("notify insert failed:", error.code);
      return { inApp: false, line: "skipped" }; // ซ้ำ (บอกไปแล้ว) หรือเขียนไม่ได้: ไม่ส่ง LINE ซ้ำ
    }
    if (!i.schoolId) return { inApp: true, line: "skipped" };
    const { t } = await dictFor(i.userId);
    const line = await pushNoticeToUser(
      i.userId, i.schoolId, { kind: i.kind, title: i.title, summary: i.body, fields: i.fields, link: i.link },
      { appUrl: siteUrl(), defaultCta: t.notif_open, retryKey: id, fetchImpl: deps.fetchImpl },
    );
    return { inApp: true, line };
  } catch (e) {
    console.error("notifyUser failed:", e instanceof Error ? e.name : "unknown");
    return { inApp: false, line: "failed" };
  }
}
