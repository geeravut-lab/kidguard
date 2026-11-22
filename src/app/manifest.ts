import type { MetadataRoute } from "next";
import { getT } from "@/lib/i18n/server";
import { DEFAULT_BRAND } from "@/lib/brand/brand";

// เฟส 5: ชื่อ/ไอคอนอ่านจากแบรนด์ที่แอดมินตั้ง (ไดนามิกอยู่แล้ว)
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { lang, t } = await getT();
  const name = lang === "th" ? DEFAULT_BRAND.name_th : DEFAULT_BRAND.name_en;
  return {
    id: "/",
    name: `${name} — ${t.app_tagline}`,
    short_name: name,
    description: t.app_description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang,
    background_color: "#f5fafb",
    theme_color: "#0b6e8a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
