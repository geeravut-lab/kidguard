"use client";

import { useState } from "react";
import { MessageCircleMore } from "lucide-react";
import { AsyncButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/browser";

/** ปุ่มเข้าสู่ระบบด้วย Google และ LINE(Aivora) — เป็นทางเลือกเพิ่ม ไม่แทนที่อีเมล/รหัสผ่าน */
export function OAuthButtons({ next, aivoraUrl }: { next: string; aivoraUrl: string }) {
  const { t } = useI18n();
  const [error, setError] = useState(false);
  const hold = () => new Promise<void>(() => {}); // คงสปินเนอร์จนเบราว์เซอร์เปลี่ยนหน้า

  async function google() {
    setError(false);
    const { error: e } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (e) {
      setError(true);
      return;
    }
    await hold();
  }
  async function aivora() {
    location.assign(aivoraUrl);
    await hold();
  }

  return (
    <div className="space-y-3">
      <AsyncButton variant="secondary" size="lg" className="w-full" onClick={google} leading={<GoogleMark />}>
        {t.auth_google}
      </AsyncButton>
      <AsyncButton variant="secondary" size="lg" className="w-full" onClick={aivora} leading={<MessageCircleMore className="size-5 text-success" aria-hidden="true" />}>
        {t.auth_line}
      </AsyncButton>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {t.err_provider}
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4z" />
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.7l3.8-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A12 12 0 0 0 1.8 7.1l3.8 3A7.2 7.2 0 0 1 12 4.8z" />
    </svg>
  );
}
