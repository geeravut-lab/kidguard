// แบรนด์ของแพลตฟอร์ม: เก็บเฉพาะที่ต่างจากค่าเริ่มต้น (ดู docs/BRANDING-KNOWLEDGE.md)
// เฟส 0 ใช้ค่าเริ่มต้นล้วน; เฟส 5 จะอ่านจาก platform_settings.brand

export const DEFAULT_BRAND_NAME = "KidGuard";

export type Brand = {
  name_th: string;
  name_en: string;
};

export const DEFAULT_BRAND: Brand = { name_th: DEFAULT_BRAND_NAME, name_en: DEFAULT_BRAND_NAME };

/** ใจกว้าง: ช่องที่หาย/ผิดรูป = ใช้ค่าเริ่มต้น (แถวเสียต้องไม่ทำให้ทุกหน้าพัง) */
export function parseBrand(raw: unknown): Brand {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (v: unknown, fallback: string) => (typeof v === "string" && validBrandName(v) ? v.trim() : fallback);
  return { name_th: pick(o.name_th, DEFAULT_BRAND.name_th), name_en: pick(o.name_en, DEFAULT_BRAND.name_en) };
}

/** 1–40 ตัวอักษร บรรทัดเดียว ห้าม < > และอักขระควบคุม (ชื่อไปอยู่ใน <title>, manifest, ข้อความ LINE) */
export function validBrandName(v: string): boolean {
  const t = v.trim();
  if (t.length < 1 || t.length > 40) return false;
  return !/[<>\u0000-\u001f\u007f]/.test(t);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * สลับชื่อเริ่มต้นเป็นชื่อที่แอดมินตั้ง "ครั้งเดียวด้วย regex เดียว"
 * (ถ้าสลับทีละชื่อ ชื่อใหม่ที่มีชื่อเดิมอยู่ข้างใน จะถูกสลับซ้ำ)
 */
export function applyBrandNames(text: string, brand: Brand, lang: "th" | "en"): string {
  const target = lang === "th" ? brand.name_th : brand.name_en;
  if (target === DEFAULT_BRAND_NAME) return text;
  return text.replace(new RegExp(escapeRe(DEFAULT_BRAND_NAME), "g"), () => target);
}
