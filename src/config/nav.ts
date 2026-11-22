import type { DictKey } from "@/lib/i18n/dict";

export type NavIcon = "home" | "parent" | "gate";
export type NavItem = { href: string; labelKey: DictKey; icon: NavIcon };

/** เมนูชุดเดียว สร้างทั้ง sidebar (desktop) และ bottom bar (มือถือ) — ดู docs/NAVIGATION-KNOWLEDGE.md
 *  เฟส 0 = เมนูผู้เยี่ยมชม; เฟสถัดไปแยกตามบทบาท */
export const VISITOR_NAV: NavItem[] = [
  { href: "/", labelKey: "nav_home", icon: "home" },
  { href: "/preview/parent", labelKey: "nav_preview_parent", icon: "parent" },
  { href: "/preview/gate", labelKey: "nav_preview_gate", icon: "gate" },
];

/** ตารางหน้าแม่สำหรับปุ่ม "กลับไป…" (ทุกหน้าที่ไม่ใช่เมนูหลักมีลิงก์กลับ) — ดู docs/BACK-BUTTON-KNOWLEDGE.md */
export const PARENTS: { pattern: RegExp; href: string; labelKey: DictKey }[] = [
  { pattern: /^\/offline$/, href: "/", labelKey: "nav_home" },
];
