import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { Suspense, type ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { PwaRegister } from "@/components/shell/pwa-register";
import { NavigationFeedback } from "@/components/ui";
import { I18nProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";
import { brandImageUrl } from "@/lib/brand/brand";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kidguards.vercel.app";

export async function generateMetadata(): Promise<Metadata> {
  const { lang, t, brand } = await getT();
  const name = lang === "th" ? brand.name_th : brand.name_en;
  const custom = !!brand.favicon;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — ${t.app_tagline}`, template: `%s | ${name}` },
    description: t.app_description,
    applicationName: name,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    // รูปแบรนด์ผ่าน /brand/* เสมอ; ?v= = เวลาที่แอดมินอัปโหลด (เห็นรูปใหม่เร็ว)
    icons: {
      icon: [{ url: brandImageUrl("/brand/favicon", brand.favicon), type: "image/png", ...(custom ? {} : { sizes: "32x32" }) }],
      apple: [{ url: custom ? brandImageUrl("/brand/favicon", brand.favicon) : "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b6e8a" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1a20" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, t } = await getT();
  return (
    <html lang={lang} className={GeistSans.variable}>
      <body>
        <I18nProvider lang={lang} dict={t}>
          <Suspense fallback={null}>
            <NavigationFeedback />
          </Suspense>
          <AppShell lang={lang} t={t}>
            {children}
          </AppShell>
          <PwaRegister />
        </I18nProvider>
      </body>
    </html>
  );
}
