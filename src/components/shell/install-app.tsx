"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Check, Share } from "lucide-react";
import { AsyncButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

const noopSubscribe = () => () => {};
function subscribeStandalone(cb: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** ปุ่มติดตั้งเป็นแอป: Android/Chrome ใช้ beforeinstallprompt, iOS แสดงวิธี Share → Add to Home Screen */
export function InstallApp({ className }: { className?: string }) {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  // ค่าจากเบราว์เซอร์: server render เป็น false แล้ว client แก้ให้ถูกหลัง hydrate (ไม่ใช้ setState ใน effect)
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const ios = useSyncExternalStore(noopSubscribe, isIOS, () => false);
  const installed = standalone || justInstalled;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p className={"inline-flex items-center gap-2 text-sm font-medium text-success " + (className ?? "")}>
        <Check className="size-4" aria-hidden="true" /> {t.install_installed}
      </p>
    );
  }

  async function onInstall() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    setHelp((v) => !v);
  }

  return (
    <div className={className}>
      <AsyncButton variant="secondary" onClick={onInstall} leading={<Download className="size-5" aria-hidden="true" />} aria-expanded={help}>
        {t.install_button}
      </AsyncButton>
      {help && (
        <div role="region" aria-label={ios ? t.install_ios_title : t.install_generic_title} className="mt-3 rounded-xl border border-line bg-surface p-4 text-sm">
          {ios ? (
            <>
              <p className="mb-2 flex items-center gap-2 font-semibold">
                <Share className="size-4" aria-hidden="true" /> {t.install_ios_title}
              </p>
              <ol className="list-decimal space-y-1 ps-5 text-ink-soft">
                <li>{t.install_ios_step1}</li>
                <li>{t.install_ios_step2}</li>
                <li>{t.install_ios_step3}</li>
              </ol>
            </>
          ) : (
            <>
              <p className="mb-1 font-semibold">{t.install_generic_title}</p>
              <p className="text-ink-soft">{t.install_generic_body}</p>
            </>
          )}
          <p className="mt-3 text-ink-soft">{t.install_note_gps}</p>
        </div>
      )}
    </div>
  );
}
