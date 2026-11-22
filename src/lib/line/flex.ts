import { LINE_COLORS, type Tone } from "@/config/line-colors";

export type Notice = {
  kind: Tone;
  title: string;
  summary?: string;
  fields?: { label: string; value: string }[];
  link?: string; // path ภายในเท่านั้น
  cta?: string;
};

// ขีดจำกัดของ LINE: ช่องใดเกิน = LINE ปฏิเสธทั้งข้อความ → ตัดทุกช่องด้วย "…" ที่ตัวสร้างการ์ด (ไม่ใช่ที่ผู้เรียก)
export const LIMITS = { title: 100, summary: 300, label: 24, value: 120, cta: 20, altText: 400, rows: 8, text: 4900 } as const;

export function cut(s: string, n: number): string {
  const t = s.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return t.length <= n ? t : t.slice(0, Math.max(0, n - 1)).trimEnd() + "…";
}

/** path ภายในเท่านั้น: ขึ้นต้น "/" ไม่ใช่ "//", ≤300, ไม่มี "\" หรืออักขระควบคุม — ไม่งั้นตกไป fallback (ไม่เคยพาออกนอกระบบ) */
export function safeHref(link: string | undefined, fallback = "/start"): string {
  if (!link || link.length > 300 || !link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(link)) return fallback;
  return link;
}

export function appOpenUrl(appUrl: string, link?: string): string {
  const path = safeHref(link);
  return `${appUrl.replace(/\/+$/, "")}${path}${path.includes("?") ? "&" : "?"}openExternalBrowser=1`; // เปิดในเบราว์เซอร์ของเครื่อง ไม่ใช่เบราว์เซอร์ในแอป LINE
}

/** altText คือสิ่งที่โชว์บนหน้าจอล็อก/รายการแชต — ต้องเข้าใจได้ในตัว */
export function altTextOf(n: Notice): string {
  const parts = [cut(n.title, LIMITS.title) + (n.summary ? ` — ${cut(n.summary, LIMITS.summary)}` : "")];
  for (const f of (n.fields ?? []).slice(0, LIMITS.rows)) parts.push(`${cut(f.label, LIMITS.label)} ${cut(f.value, LIMITS.value)}`);
  return cut(parts.join(" · "), LIMITS.altText);
}

export function buildLineMessage(n: Notice, o: { appUrl: string; defaultCta: string }) {
  const rows = (n.fields ?? []).slice(0, LIMITS.rows).map((f) => ({
    type: "box", layout: "baseline", spacing: "sm",
    contents: [
      { type: "text", text: cut(f.label, LIMITS.label) || "-", size: "sm", color: LINE_COLORS.label, flex: 2, wrap: true },
      { type: "text", text: cut(f.value, LIMITS.value) || "-", size: "sm", color: LINE_COLORS.text, flex: 4, wrap: true },
    ],
  }));
  return {
    type: "flex" as const,
    altText: altTextOf(n),
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type: "text", text: cut(n.title, LIMITS.title) || "-", weight: "bold", size: "md", color: LINE_COLORS.title[n.kind], wrap: true },
          ...(n.summary ? [{ type: "text", text: cut(n.summary, LIMITS.summary), size: "sm", color: LINE_COLORS.text, wrap: true }] : []),
          ...rows,
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{ type: "button", style: "primary", color: LINE_COLORS.button, action: { type: "uri", label: cut(n.cta || o.defaultCta, LIMITS.cta) || "Open", uri: appOpenUrl(o.appUrl, n.link) } }],
      },
    },
  };
}

/** ข้อความธรรมดา (fallback เมื่อการ์ดโดน 400) — ข้อมูลชุดเดียวกัน */
export function buildTextMessage(n: Notice, o: { appUrl: string }) {
  const lines = [cut(n.title, LIMITS.title)];
  if (n.summary) lines.push(cut(n.summary, LIMITS.summary));
  for (const f of (n.fields ?? []).slice(0, LIMITS.rows)) lines.push(`${cut(f.label, LIMITS.label)}: ${cut(f.value, LIMITS.value)}`);
  lines.push(appOpenUrl(o.appUrl, n.link));
  return { type: "text" as const, text: lines.join("\n").slice(0, LIMITS.text) };
}
