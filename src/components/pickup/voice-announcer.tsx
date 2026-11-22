"use client";

import { Volume2, VolumeOff } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { AsyncButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export type VoiceTarget = { key: string; text: string };

function speak(text: string, lang: "th" | "en") {
  try {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "th" ? "th-TH" : "en-US";
    const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
    if (v) u.voice = v;
    u.rate = 0.95;
    synth.speak(u);
  } catch {
    /* ไม่รองรับ/ถูกบล็อก: เงียบ (หน้าจอยังแสดงชื่อ) */
  }
}

/**
 * เสียงเรียกนักเรียน (Web Speech API): พูดเฉพาะรายการ "ใหม่" ที่ถูกเรียก — ไม่พูดซ้ำเมื่อหน้ารีเฟรช
 * ต้องกดเปิดเองหนึ่งครั้ง (เบราว์เซอร์ไม่ยอมให้เล่นเสียงก่อนผู้ใช้แตะ) และเปิดแล้วจำไว้ในเครื่องนั้น
 */
const EVT = "kg-voice-change";
function readOn(): boolean {
  try {
    return localStorage.getItem("kg_voice") === "1";
  } catch {
    return false;
  }
}
function subscribeOn(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function VoiceAnnouncer({ targets, label }: { targets: VoiceTarget[]; label?: { on: string; off: string } }) {
  const { t, lang } = useI18n();
  const on = useSyncExternalStore(subscribeOn, readOn, () => false);
  const supported = useSyncExternalStore(() => () => {}, () => "speechSynthesis" in window, () => true);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!on) {
      seen.current = new Set(targets.map((x) => x.key)); // ตอนปิด: จำของที่มีอยู่ เพื่อไม่พูดย้อนหลังตอนเปิด
      return;
    }
    const s = seen.current ?? new Set<string>();
    for (const x of targets) {
      if (!s.has(x.key)) {
        s.add(x.key);
        speak(x.text, lang);
      }
    }
    seen.current = s;
  }, [targets, on, lang]);

  if (!supported) return <p className="text-sm text-ink-soft">{t.voice_unsupported}</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AsyncButton
        variant={on ? "primary" : "secondary"}
        size="sm"
        aria-pressed={on}
        data-testid="voice-toggle"
        leading={on ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeOff className="size-4" aria-hidden="true" />}
        onClick={() => {
          const next = !on;
          if (next) speak(" ", lang); // ปลุกเสียงด้วยการแตะของผู้ใช้
          try {
            localStorage.setItem("kg_voice", next ? "1" : "0");
          } catch {
            /* ไม่เป็นไร */
          }
          window.dispatchEvent(new Event(EVT));
        }}
      >
        {on ? (label?.off ?? t.voice_disable) : (label?.on ?? t.voice_enable)}
      </AsyncButton>
      {!on && <span className="text-xs text-ink-soft">{t.voice_hint}</span>}
    </div>
  );
}
