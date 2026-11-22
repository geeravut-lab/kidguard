"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { AsyncLink } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/browser";

const TIMEOUT_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * หน้ารับตั๋ว SSO จาก Aivora (docs/SSO-Aivora-Supabase.md ขั้นที่ 4–7)
 *  - ลบ sso_ticket ออกจาก URL ก่อน await ตัวแรก (ตั๋วใช้ได้ครั้งเดียว อายุ 60 วินาที)
 *  - retry เฉพาะ setSession ห้ามวนกลับไปแลกตั๋วใหม่
 *  - ไม่พึ่ง onAuthStateChange: เรียกขั้นถัดไปตรง ๆ หลัง setSession
 *  - ไม่หมุนค้างเงียบ: ข้อความจริง + ปุ่มกลับ + timeout 15 วินาที + console.info ตาม checkpoint
 */
export function SsoCallback() {
  const { t } = useI18n();
  const [status, setStatus] = useState<"working" | "failed" | "timeout">("working");
  const started = useRef(false);
  const finished = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode: ห้ามแลกตั๋วซ้ำ
    started.current = true;

    const timer = setTimeout(() => {
      if (!finished.current) {
        console.error("[sso] timeout");
        setStatus("timeout");
      }
    }, TIMEOUT_MS);

    (async () => {
      const url = new URL(location.href);
      const ticket = url.searchParams.get("sso_ticket");
      if (!ticket) {
        console.error("[sso] no ticket in URL");
        finished.current = true;
        setStatus("failed");
        return;
      }
      url.searchParams.delete("sso_ticket");
      history.replaceState(null, "", url.pathname + url.search); // ก่อน await ตัวแรก
      console.info("[sso] 1/6 ticket found");

      try {
        const res = await fetch("/api/sso/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket }) });
        if (!res.ok) throw new Error(`exchange failed (${res.status})`);
        const tokens = (await res.json()) as { access_token: string; refresh_token: string };
        console.info("[sso] 2/6 ticket exchanged");

        const supabase = createClient();
        let userId: string | undefined;
        for (let attempt = 1; attempt <= 3 && !userId; attempt++) {
          const { data, error } = await supabase.auth.setSession(tokens); // retry เฉพาะขั้นนี้
          if (!error && data.user) userId = data.user.id;
          else {
            console.error("[sso] setSession failed, attempt", attempt, error?.message);
            await sleep(500);
          }
        }
        if (!userId) throw new Error("setSession failed");
        console.info("[sso] 3/6 session set, user", userId);

        console.info("[sso] 4/6 bootstrap start");
        const { data: me, error: meErr } = await supabase.rpc("kg_me");
        if (meErr || !me) throw new Error("profile not ready");
        console.info("[sso] 5/6 profile ready");
        finished.current = true;
        console.info("[sso] 6/6 bootstrap done → /start");
        location.replace("/start"); // เซิร์ฟเวอร์อ่าน cookie ที่เพิ่งตั้ง แล้วพาไปหน้าตามบทบาท
      } catch (e) {
        console.error("[sso] failed:", e instanceof Error ? e.message : e);
        finished.current = true;
        setStatus("failed");
      }
    })();

    return () => clearTimeout(timer);
  }, []);

  if (status === "working") {
    return (
      <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden="true" />
        <p className="text-lg font-medium">{t.auth_checking}</p>
      </div>
    );
  }
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <TriangleAlert className="size-12 text-warn" aria-hidden="true" />
      <h1 className="text-2xl font-bold">{t.sso_failed_title}</h1>
      <p className="text-ink-soft">{status === "timeout" ? t.sso_timeout : t.sso_failed_body}</p>
      <AsyncLink href="/login" className={buttonVariants({ variant: "primary" })}>
        {t.sso_back}
      </AsyncLink>
    </div>
  );
}
