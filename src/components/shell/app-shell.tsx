import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { navFor } from "@/config/nav";
import { getMe, getUnreadCount } from "@/lib/auth/me";
import { getMyFingerprint } from "@/lib/live/fingerprint";
import { LiveSync } from "@/components/live/live-sync";
import { NotificationBell } from "@/components/notify/notification-bell";
import { UserCard } from "./user-card";
import type { Dict, Lang } from "@/lib/i18n/dict";
import { DEFAULT_BRAND } from "@/lib/brand/brand";
import { InstallApp } from "./install-app";
import { LangSwitch } from "./lang-switch";
import { BottomBar, SidebarNav, type NavEntry } from "./nav-links";

export async function AppShell({ lang, t, children }: { lang: Lang; t: Dict; children: ReactNode }) {
  const me = await getMe();
  const fp = me ? await getMyFingerprint() : undefined; // ก่อนอ่านจำนวนที่ยังไม่อ่าน (baseline ต้องไม่ใหม่กว่าข้อมูลที่แสดง)
  const unread = me ? await getUnreadCount() : 0;
  const items: NavEntry[] = navFor(me).map((i) => ({ href: i.href, label: t[i.labelKey], icon: i.icon }));
  const name = lang === "th" ? DEFAULT_BRAND.name_th : DEFAULT_BRAND.name_en;

  const brandBlock = (
    <div className="flex items-center gap-3">
      <LogoMark size={40} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-lg font-bold">{name}</p>
        <p className="truncate text-xs text-ink-soft">{t.school_default_name}</p>
      </div>
      {me && <NotificationBell count={unread} t={t} />}
    </div>
  );

  return (
    <div className="md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
      >
        {t.skip_to_content}
      </a>

      {/* Desktop: sidebar สูงเท่าจอ ติดขอบบน; รายการเมนูเลื่อนเองได้ ปุ่มล่างอยู่กับที่ */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-6 border-e border-line bg-surface p-5 md:flex">
        {brandBlock}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav items={items} label={t.nav_main} />
        </div>
        <div className="flex flex-col gap-4">
          <UserCard me={me} t={t} />
          <InstallApp />
          <LangSwitch lang={lang} t={t} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* มือถือ: header บน */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          {brandBlock}
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">
          {children}
        </main>
      </div>

      {me && <LiveSync quiet topics={[`u:${me.user_id}`]} fingerprintUrl="/api/live?scope=me" initial={fp} />}
      <BottomBar
        items={items}
        moreLabel={t.nav_more}
        closeLabel={t.nav_close}
        navLabel={t.nav_main}
        sheet={
          <div className="flex flex-col gap-5">
            <UserCard me={me} t={t} />
            <InstallApp />
            <LangSwitch lang={lang} t={t} />
          </div>
        }
      />
    </div>
  );
}
