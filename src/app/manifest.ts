import type { MetadataRoute } from "next";
import { getT } from "@/lib/i18n/server";
import { brandImageUrl } from "@/lib/brand/brand";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { lang, t, brand } = await getT();
  const name = lang === "th" ? brand.name_th : brand.name_en;
  const src = brandImageUrl("/brand/favicon", brand.favicon);
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
    // ไอคอนของแอดมิน (PNG จัตุรัส 192–1024) ใช้ทั้งสองขนาดที่เบราว์เซอร์ต้องการ; ไม่มี = ชุดในตัว (+ maskable)
    icons: brand.favicon
      ? [
          { src, sizes: "192x192", type: "image/png", purpose: "any" },
          { src, sizes: "512x512", type: "image/png", purpose: "any" },
        ]
      : [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
  };
}
