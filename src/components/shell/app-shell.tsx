import { after } from "next/server";
import { trackEvent } from "@/lib/analytics/server";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { navFor } from "@/config/nav";
import { getFlags } from "@/lib/flags/server";
import { disabledNavHrefs } from "@/lib/flags/flags";
import { getSchoolNotice } from "@/lib/safety/server";
import { NoticeBanner } from "./notice-banner";
import { getMe, getUnreadCount } from "@/lib/auth/me";
import { getMyFingerprint } from "@/lib/live/fingerprint";
import { LiveSync } from "@/components/live/live-sync";
import { NotificationBell } from "@/components/notify/notification-bell";
import { UserCard } from "./user-card";
import type { Dict, Lang } from "@/lib/i18n/dict";
import { brandImageUrl } from "@/lib/brand/brand";
import { loadBrand } from "@/lib/brand/server";
import { getShellSchool } from "@/lib/auth/shell-school";
import { InstallApp } from "./install-app";
import { LangSwitch } from "./lang-switch";
import { BottomBar, SidebarNav, type NavEntry } from "./nav-links";

export async function AppShell({ lang, t, children }: { lang: Lang; t: Dict; children: ReactNode }) {
  if ((await headers()).get("x-kg-bare") === "1") return <main id="main">{children}</main>; // จอ TV: เต็มจอ ไม่มีเมนู
  const me = await getMe();
  const fp = me ? await getMyFingerprint() : undefined; // ก่อนอ่านจำนวนที่ยังไม่อ่าน (baseline ต้องไม่ใหม่กว่าข้อมูลที่แสดง)
  const unread = me ? await getUnreadCount() : 0;
  if (me) after(() => trackEvent("active", me.user_id)); // วันละครั้งต่อคน ไม่หน่วงหน้า
  const [flags, brand, school] = await Promise.all([getFlags(), loadBrand(), getShellSchool(me)]);
  const notice = await getSchoolNotice(school?.id);
  const nav = navFor(me);
  const off = disabledNavHrefs(nav, flags);
  const items: NavEntry[] = nav.map((i) => ({ href: i.href, label: t[i.labelKey], icon: i.icon, disabled: off.has(i.href) }));
  const name = lang === "th" ? brand.name_th : brand.name_en;
  const schoolLabel = school ? (lang === "en" && school.name_en ? school.name_en : school.name_th) : t.school_default_name;
  // โลโก้โรงเรียน (ถ้ามี) แทนโลโก้แพลตฟอร์มของหัวเมนู; ?v= = เห็นรูปใหม่ทันทีที่เปลี่ยน
  const logoSrc = school?.logo ? brandImageUrl(`/brand/school/${school.id}`, school.logo) : brandImageUrl("/brand/logo", brand.logo);

  const brandBlock = (
    <div className="flex items-center gap-3">
      <LogoMark size={40} src={logoSrc} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-lg font-bold">{name}</p>
        <p className="truncate text-xs text-ink-soft">{schoolLabel}</p>
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
        {notice && me && <NoticeBanner notice={notice} t={t} />}
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
