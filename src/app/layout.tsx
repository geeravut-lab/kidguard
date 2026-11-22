import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { Suspense, type ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { PwaRegister } from "@/components/shell/pwa-register";
import { NavigationFeedback } from "@/components/ui";
import { I18nProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";
import { DEFAULT_BRAND } from "@/lib/brand/brand";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kidguards.vercel.app";

export async function generateMetadata(): Promise<Metadata> {
  const { lang, t } = await getT();
  const name = lang === "th" ? DEFAULT_BRAND.name_th : DEFAULT_BRAND.name_en;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — ${t.app_tagline}`, template: `%s | ${name}` },
    description: t.app_description,
    applicationName: name,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    // รูปแบรนด์ผ่าน /brand/* เสมอ (เฟส 5: แอดมินอัปโหลดแทนได้)
    icons: {
      icon: [{ url: "/brand/favicon", type: "image/png", sizes: "32x32" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
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
