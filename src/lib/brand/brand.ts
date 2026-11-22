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

// ===== รูปแบรนด์ (docs/BRANDING-KNOWLEDGE.md §3.2) =====
export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
/** version = เวลาที่อัปโหลด: ใช้เป็น ETag + ?v= + ชื่อไฟล์ใน storage (ห้ามเขียนทับไฟล์เดิม) */
export type ImageRef = { mime: ImageMime; version: number; px?: number };

export const LOGO_MAX_BYTES = 1_048_576;
export const FAVICON_MAX_BYTES = 524_288;
export const FAVICON_MIN_PX = 192;
export const FAVICON_MAX_PX = 1024;
export const IMAGE_EXT: Record<ImageMime, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function parseImageRef(raw: unknown): ImageRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const mime = o.mime;
  const v = o.version;
  if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") return null;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) return null;
  const px = typeof o.px === "number" && Number.isInteger(o.px) && o.px >= 16 && o.px <= 4096 ? o.px : undefined;
  return px ? { mime, version: v, px } : { mime, version: v };
}

export type BrandAssets = { logo: ImageRef | null; favicon: ImageRef | null };
export function parseBrandAssets(raw: unknown): BrandAssets {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { logo: parseImageRef(o.logo), favicon: parseImageRef(o.favicon) };
}

/** ชนิดจากไบต์จริง (ไม่เชื่อนามสกุลหรือ Content-Type ที่ client ส่งมา; ไม่รับ SVG/HTML) */
export function detectImageMime(b: Uint8Array): ImageMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** ขนาดจาก header ของ PNG (IHDR) */
export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  if (detectImageMime(b) !== "image/png" || b.length < 24) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(12) !== 0x49484452) return null; // "IHDR"
  const w = dv.getUint32(16);
  const h = dv.getUint32(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

export type ImageCheck = { ok: true; mime: ImageMime } | { ok: false; error: "err_image_type" | "err_image_too_big" | "err_image_square" | "err_image_dims" };

/** โลโก้: PNG/JPEG/WebP ≤ 1 MB */
export function checkLogo(b: Uint8Array): ImageCheck {
  if (b.length > LOGO_MAX_BYTES) return { ok: false, error: "err_image_too_big" };
  const mime = detectImageMime(b);
  return mime ? { ok: true, mime } : { ok: false, error: "err_image_type" };
}

/** ไอคอนแท็บ/ติดตั้ง: ต้องเป็น PNG สี่เหลี่ยมจัตุรัส 192–1024 px ≤ 512 KB (ใช้เป็นไอคอนบนหน้าจอมือถือด้วย) */
export function checkFavicon(b: Uint8Array): ImageCheck {
  if (b.length > FAVICON_MAX_BYTES) return { ok: false, error: "err_image_too_big" };
  const mime = detectImageMime(b);
  if (mime !== "image/png") return { ok: false, error: "err_image_type" };
  const s = pngSize(b);
  if (!s) return { ok: false, error: "err_image_type" };
  if (s.w !== s.h) return { ok: false, error: "err_image_square" };
  if (s.w < FAVICON_MIN_PX || s.w > FAVICON_MAX_PX) return { ok: false, error: "err_image_dims" };
  return { ok: true, mime };
}

/** path ใน bucket: <kind>-<version>.<ext> (โลโก้โรงเรียนอยู่ใต้ school/<id>/) */
export const brandObjectPath = (kind: "logo" | "favicon", ref: ImageRef, schoolId?: string) =>
  `${schoolId ? `school/${schoolId}/` : ""}${kind}-${ref.version}.${IMAGE_EXT[ref.mime]}`;

export const brandImageUrl = (base: string, ref: ImageRef | null) => (ref ? `${base}?v=${ref.version}` : base);
