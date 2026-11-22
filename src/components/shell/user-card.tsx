import { LogIn, LogOut, UserPlus } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { AsyncForm, AsyncLink, SubmitButton } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import type { Me } from "@/lib/auth/me";
import type { Dict } from "@/lib/i18n/dict";

function roleLabels(me: Me, t: Dict): string[] {
  const out: string[] = [];
  if (me.platform_admin) out.push(t.role_label_super_admin);
  for (const r of new Set(me.memberships.map((m) => m.role))) out.push(t[`role_label_${r}` as const]);
  if (me.role === "parent") out.push(t.role_label_parent);
  return out;
}

/** การ์ดผู้ใช้ + ออกจากระบบ (ผู้เยี่ยมชมเห็นปุ่มเข้าสู่ระบบ/สมัคร) */
export function UserCard({ me, t }: { me: Me | null; t: Dict }) {
  if (!me) {
    return (
      <div className="flex flex-col gap-2">
        <AsyncLink href="/login" className={buttonVariants({ variant: "primary" })}>
          <LogIn className="size-5" aria-hidden="true" /> {t.auth_login_submit}
        </AsyncLink>
        <AsyncLink href="/signup" className={buttonVariants({ variant: "secondary" })}>
          <UserPlus className="size-5" aria-hidden="true" /> {t.auth_signup_submit}
        </AsyncLink>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-3">
      <div className="min-w-0">
        <p className="text-xs text-ink-soft">{t.auth_signed_in_as}</p>
        <p className="truncate font-semibold">{me.display_name ?? "—"}</p>
        <p className="truncate text-xs text-ink-soft">{roleLabels(me, t).join(" · ")}</p>
      </div>
      <AsyncForm action={signOutAction}>
        <SubmitButton variant="secondary" size="sm" className="w-full" leading={<LogOut className="size-4" aria-hidden="true" />}>
          {t.auth_logout}
        </SubmitButton>
      </AsyncForm>
    </div>
  );
}
