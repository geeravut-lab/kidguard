import type { DictKey } from "@/lib/i18n/dict";
import type { Me } from "@/lib/auth/me";

export type NavIcon = "home" | "parent" | "gate" | "children" | "account" | "teacher" | "classroom" | "students" | "staff" | "settings" | "approvals" | "platform";
export type NavItem = { href: string; labelKey: DictKey; icon: NavIcon };

/** เมนูชุดเดียว สร้างทั้ง sidebar (desktop) และ bottom bar (มือถือ) — ดู docs/NAVIGATION-KNOWLEDGE.md */
export const VISITOR_NAV: NavItem[] = [
  { href: "/", labelKey: "nav_home", icon: "home" },
  { href: "/preview/parent", labelKey: "nav_preview_parent", icon: "parent" },
  { href: "/preview/gate", labelKey: "nav_preview_gate", icon: "gate" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", labelKey: "nav_admin_approvals", icon: "approvals" },
  { href: "/admin/classrooms", labelKey: "nav_admin_classrooms", icon: "classroom" },
  { href: "/admin/students", labelKey: "nav_admin_students", icon: "students" },
  { href: "/admin/members", labelKey: "nav_admin_members", icon: "staff" },
  { href: "/admin/settings", labelKey: "nav_admin_settings", icon: "settings" },
];

/** เมนูตามสิทธิ์: รวมทุกบทบาทที่ผู้ใช้มี (ไม่ซ้ำ) แล้วปิดท้ายด้วยบัญชีของฉัน */
export function navFor(me: Me | null): NavItem[] {
  if (!me) return VISITOR_NAV;
  const roles = new Set(me.memberships.map((m) => m.role));
  const items: NavItem[] = [];
  if (roles.has("school_admin") || me.platform_admin) items.push(...ADMIN_NAV);
  if (roles.has("teacher")) items.push({ href: "/teacher", labelKey: "nav_teacher", icon: "teacher" });
  if (roles.has("gate_staff") || roles.has("school_admin")) items.push({ href: "/gate", labelKey: "nav_gate", icon: "gate" });
  if (me.platform_admin) items.push({ href: "/platform", labelKey: "nav_platform", icon: "platform" });
  if (me.role === "parent" || items.length === 0) items.push({ href: me.onboarded ? "/home" : "/onboarding", labelKey: "nav_parent_home", icon: "children" });
  items.push({ href: "/profile", labelKey: "nav_profile", icon: "account" });
  return items;
}
