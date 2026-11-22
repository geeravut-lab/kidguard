import "server-only";

/** ค่าของ Aivora hub (ไม่ลับ): ฐานของ hub และ slug ที่ลงทะเบียนไว้ */
export function getSsoConfig() {
  const hubBase = (process.env.AIVORA_HUB_URL || "https://aivora-lc.netlify.app").replace(/\/+$/, "");
  const slug = process.env.AIVORA_APP_SLUG || "kidguard";
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://kidguards.vercel.app";
  return { hubBase, slug, siteHost: new URL(site).host, callback: `${site.replace(/\/+$/, "")}/sso/callback` };
}

export function aivoraAuthorizeUrl() {
  const c = getSsoConfig();
  return `${c.hubBase}/sso/authorize?app=${encodeURIComponent(c.slug)}&return=${encodeURIComponent(c.callback)}`;
}
