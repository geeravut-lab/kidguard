import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cache } from "react";
import { loadPlatformSettings, invalidatePlatformSettings, savePlatformSetting } from "@/lib/settings/platform";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { brandObjectPath, checkFavicon, checkLogo, DEFAULT_BRAND, pngSize, parseBrand, parseBrandAssets, parseImageRef, type Brand, type BrandAssets, type ImageRef } from "./brand";

export const BUCKET = "brand-assets";

export type FullBrand = Brand & BrandAssets;

/** แบรนด์ของแพลตฟอร์ม (cache 30 วินาที); อ่านไม่ได้ = ค่าเริ่มต้น */
export const loadBrand = cache(async (): Promise<FullBrand> => {
  const raw = (await loadPlatformSettings()).brand;
  return { ...parseBrand(raw), ...parseBrandAssets(raw) };
});

export type SchoolBrandRow = { logo: unknown };
export const schoolLogoRef = (row: SchoolBrandRow | null | undefined): ImageRef | null => parseImageRef(row?.logo);

type Kind = "logo" | "favicon";
export type SaveImageResult = { ok: true; ref: ImageRef } | { ok: false; error: string };

/**
 * บันทึกรูป: ตรวจชนิด/ขนาดจากไบต์ → อัปโหลดไฟล์ใหม่ (version ใหม่ ไม่ทับ) → ชี้ settings → ลบไฟล์เก่า
 * (ถ้าชี้ไม่สำเร็จ ลบไฟล์ใหม่ทิ้ง ยังใช้รูปเดิม; ไม่มีช่วงที่ "ไม่มีรูป")
 * scope: แพลตฟอร์ม (kind = logo/favicon ใน platform_settings.brand) หรือโรงเรียน (logo ใน schools.logo)
 */
export async function saveBrandImage(opts: { kind: Kind; bytes: Uint8Array; schoolId?: string }): Promise<SaveImageResult> {
  const check = opts.kind === "favicon" ? checkFavicon(opts.bytes) : checkLogo(opts.bytes);
  if (!check.ok) return { ok: false, error: check.error };
  const px = opts.kind === "favicon" ? pngSize(opts.bytes)?.w : undefined;
  const ref: ImageRef = px ? { mime: check.mime, version: Date.now(), px } : { mime: check.mime, version: Date.now() };
  const path = brandObjectPath(opts.kind, ref, opts.schoolId);
  const storage = supabaseAdmin().storage.from(BUCKET);
  const up = await storage.upload(path, opts.bytes, { contentType: ref.mime, upsert: false, cacheControl: "60" });
  if (up.error) return { ok: false, error: "err_generic" };

  let old: ImageRef | null = null;
  let saved = false;
  if (opts.schoolId) {
    const a = supabaseAdmin();
    const cur = await a.from("schools").select("logo").eq("id", opts.schoolId).maybeSingle();
    old = parseImageRef(cur.data?.logo);
    const { data, error } = await a.from("schools").update({ logo: ref as never }).eq("id", opts.schoolId).select("id");
    saved = !error && data?.length === 1;
  } else {
    const raw = ((await loadPlatformSettingsFresh()).brand ?? {}) as Record<string, unknown>;
    old = parseImageRef(raw[opts.kind]);
    saved = await savePlatformSetting("brand", { ...raw, [opts.kind]: ref });
  }
  if (!saved) {
    await storage.remove([path]);
    return { ok: false, error: "err_save_failed" };
  }
  if (old) await storage.remove([brandObjectPath(opts.kind, old, opts.schoolId)]);
  invalidatePlatformSettings();
  return { ok: true, ref };
}

/** กลับไปใช้รูปในตัว: ลบ ref + ลบไฟล์ */
export async function clearBrandImage(opts: { kind: Kind; schoolId?: string }): Promise<boolean> {
  const storage = supabaseAdmin().storage.from(BUCKET);
  let old: ImageRef | null = null;
  let saved = false;
  if (opts.schoolId) {
    const a = supabaseAdmin();
    const cur = await a.from("schools").select("logo").eq("id", opts.schoolId).maybeSingle();
    old = parseImageRef(cur.data?.logo);
    const { data, error } = await a.from("schools").update({ logo: null }).eq("id", opts.schoolId).select("id");
    saved = !error && data?.length === 1;
  } else {
    const raw = ((await loadPlatformSettingsFresh()).brand ?? {}) as Record<string, unknown>;
    old = parseImageRef(raw[opts.kind]);
    const next = { ...raw };
    delete next[opts.kind];
    saved = await savePlatformSetting("brand", next);
  }
  if (saved && old) await storage.remove([brandObjectPath(opts.kind, old, opts.schoolId)]);
  invalidatePlatformSettings();
  return saved;
}

async function loadPlatformSettingsFresh() {
  invalidatePlatformSettings();
  return loadPlatformSettings();
}

/** ชื่อแบรนด์: เขียนเฉพาะที่ต่างจากค่าเริ่มต้น (คงรูปภาพไว้) */
export async function saveBrandNames(names: Brand): Promise<boolean> {
  const raw = ((await loadPlatformSettingsFresh()).brand ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...raw };
  for (const k of ["name_th", "name_en"] as const) {
    if (names[k] === DEFAULT_BRAND[k]) delete next[k];
    else next[k] = names[k];
  }
  return savePlatformSetting("brand", next);
}

/**
 * เสิร์ฟรูป: ไม่มีรูปของแอดมิน → redirect ไปรูปในตัว; If-None-Match ตรง → 304; ไม่งั้นส่งไบต์ + ETag + nosniff + CSP sandbox
 * (ปลอดภัยแม้ไฟล์ถูกเปิดตรง ๆ)
 */
export async function serveBrandImage(req: NextRequest, ref: ImageRef | null, kind: Kind, fallback: string, schoolId?: string): Promise<NextResponse> {
  const fallbackRes = () => {
    const r = NextResponse.redirect(new URL(fallback, req.url), 307);
    r.headers.set("Cache-Control", "public, max-age=60");
    return r;
  };
  if (!ref) return fallbackRes();
  const etag = `"${schoolId ? "s" : "p"}-${kind}-${ref.version}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "public, max-age=60, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(brandObjectPath(kind, ref, schoolId));
  if (error || !data) return fallbackRes();
  return new NextResponse(Buffer.from(await data.arrayBuffer()), { status: 200, headers: { ...headers, "Content-Type": ref.mime } });
}
