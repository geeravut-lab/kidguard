"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { publicEnv } from "@/lib/env";
import { cn } from "@/lib/cn";

type Props = {
  /** หัวข้อที่หน้านี้ต้องฟัง (ฟังเฉพาะที่หน้านั้นแสดง — โควตาการเชื่อมต่อนับต่อแท็บ) */
  topics: string[];
  /** URL ลายนิ้วมือสำรอง เช่น /api/live?scope=school&id=... */
  fingerprintUrl: string;
  /** ช่วงโพลล์ตอนใช้ทางสำรอง (มิลลิวินาที) */
  fallbackMs?: number;
  /** ไม่แสดงตัวบอกสถานะ (ใช้กับตัวฟังกลางใน AppShell) */
  quiet?: boolean;
  /** ลายเซ็น ณ ตอน server render (คำนวณก่อนอ่านข้อมูล) — ใช้เป็น baseline เพื่อไม่พลาดการเปลี่ยนที่เกิดก่อน client เริ่มถาม */
  initial?: string;
};

const typing = () => {
  const el = document.activeElement as HTMLInputElement | null;
  return !!el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && el.value !== "" && el.type !== "hidden" && el.type !== "checkbox";
};

/**
 * Live sync (docs/LIVE-SYNC-KNOWLEDGE.md): ฐานข้อมูลส่ง "ping ไม่มีข้อมูล" → router.refresh() อ่านข้อมูลใหม่ด้วยสิทธิ์ของผู้ใช้เอง
 *  - socket ใช้ token จาก /api/live/token และไม่จัดการ session/คุกกี้เอง
 *  - ถ้า socket ใช้ไม่ได้: โพลล์ลายนิ้วมือ (ช้าลงเรื่อย ๆ ตอนเงียบ); กลับมาที่แท็บ/ออนไลน์ → ถามหนึ่งครั้งเพื่อตามให้ทัน
 *  - ไม่ refresh ใต้มือผู้ใช้ขณะพิมพ์ และพักเมื่อแท็บถูกซ่อน
 */
export function LiveSync({ topics, fingerprintUrl, fallbackMs = 5000, quiet = false, initial }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [state, setState] = useState<"connecting" | "live" | "poll">("connecting");
  const key = topics.join("|"); // ขึ้นกับ "ค่า" ไม่ใช่อาร์เรย์ (กันต่อ socket ใหม่ทุกครั้งที่ server render)

  useEffect(() => {
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let tokenTimer: ReturnType<typeof setInterval> | undefined;
    let baseline: string | null = initial ?? null;
    let pendingWhileHidden = false;
    let idle = 0;
    let stopped = false;
    const subscribed = new Set<string>();
    const wanted = key.split("|").filter(Boolean);
    let sb: ReturnType<typeof createClient> | null = null;

    const doRefresh = () => {
      if (disposed) return;
      if (document.hidden) {
        pendingWhileHidden = true;
        return;
      }
      if (typing()) {
        refreshTimer = setTimeout(doRefresh, 3000);
        return;
      }
      pendingWhileHidden = false;
      router.refresh();
    };
    const refreshSoon = () => {
      idle = 0;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(doRefresh, 300); // หลาย ping ติดกัน = refresh ครั้งเดียว
    };
    const socketOk = () => wanted.length > 0 && subscribed.size === wanted.length;

    async function check() {
      try {
        const r = await fetch(fingerprintUrl, { cache: "no-store" });
        if (r.status === 401) {
          stopped = true; // ออกจากระบบแล้ว หยุดถาม
          return;
        }
        if (!r.ok) return;
        const j = (await r.json()) as { t?: string };
        if (baseline === null) baseline = j.t ?? "";
        else if (j.t !== baseline) {
          baseline = j.t ?? "";
          refreshSoon();
        } else idle++;
      } catch {
        /* ออฟไลน์ชั่วคราว: รอบหน้า */
      }
    }
    function schedulePoll() {
      if (disposed || stopped) return;
      const base = socketOk() ? 30_000 : fallbackMs;
      const slow = idle > 18 ? 4 : idle > 6 ? 2 : 1; // เงียบนาน → ช้าลงเรื่อย ๆ (สูงสุด 60 วินาที)
      const delay = document.hidden ? 30_000 : Math.min(60_000, base * slow);
      pollTimer = setTimeout(async () => {
        await check();
        schedulePoll();
      }, delay);
    }
    const onVisible = () => {
      if (!document.hidden) {
        if (pendingWhileHidden) refreshSoon();
        void check();
      }
    };

    async function connect() {
      if (process.env.NEXT_PUBLIC_LIVE_REALTIME === "0" || wanted.length === 0) return;
      try {
        const getToken = async () => {
          const r = await fetch("/api/live/token", { cache: "no-store" });
          if (!r.ok) throw new Error("no token");
          return ((await r.json()) as { token: string }).token;
        };
        const token = await getToken();
        if (disposed) return;
        // client ธรรมดาที่ปิด persistSession/autoRefreshToken — ไม่แตะคุกกี้ล็อกอิน
        sb = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        await sb.realtime.setAuth(token);
        tokenTimer = setInterval(async () => {
          try {
            await sb?.realtime.setAuth(await getToken());
          } catch {
            /* รอบหน้า */
          }
        }, 45 * 60_000);
        for (const topic of wanted) {
          sb.channel(topic, { config: { private: true } })
            .on("broadcast", { event: "ping" }, refreshSoon)
            .subscribe((status) => {
              if (disposed) return;
              if (status === "SUBSCRIBED") subscribed.add(topic);
              else subscribed.delete(topic);
              setState(socketOk() ? "live" : "poll");
              if (status === "SUBSCRIBED" && socketOk()) void check(); // ตามให้ทันสิ่งที่พลาดระหว่างต่อ
            });
        }
      } catch {
        if (!disposed) setState("poll");
      }
    }

    void check(); // baseline
    schedulePoll();
    void connect();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      disposed = true;
      clearTimeout(refreshTimer);
      clearTimeout(pollTimer);
      clearInterval(tokenTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      void sb?.removeAllChannels();
    };
  }, [key, fingerprintUrl, fallbackMs, router, initial]);

  if (quiet) return null;
  return (
    <span data-testid="live-status" data-state={state} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <span aria-hidden="true" className={cn("size-2 rounded-full", state === "live" ? "bg-success" : state === "poll" ? "bg-warn" : "bg-line")} />
      {state === "live" ? t.queue_live : state === "poll" ? t.queue_poll : t.queue_connecting}
    </span>
  );
}
