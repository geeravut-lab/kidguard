import { notFound } from "next/navigation";
import { endCustodyFlagAction } from "@/app/actions/safety";
import { CustodyForm, StudentPickForm } from "@/components/admin/safety-admin-forms";
import { Card } from "@/components/parent/sections";
import { PageHead, fmtDate, schoolName } from "@/components/staff/page-head";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requireSchoolRole } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/validation";

export const metadata = { title: "ธงห้ามปล่อย", robots: { index: false } };

export default async function CustodyPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/custody");
  if (!(await featureEnabled("custody_flags"))) notFound();
  const { lang, t } = await getT();
  const a = supabaseAdmin();
  const sp = uuidSchema.safeParse((await searchParams).student);
  const [students, flags] = await Promise.all([
    a.from("students").select("id,first_name,last_name,nickname,classrooms:classroom_id(name)").eq("school_id", school.id).eq("status", "active").order("first_name").limit(2000),
    a.from("custody_flags").select("id,kind,note,active,created_at,students(first_name,nickname,classrooms:classroom_id(name))").eq("school_id", school.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const opts = ((students.data ?? []) as unknown as { id: string; first_name: string; last_name: string; nickname: string | null; classrooms: { name: string } | null }[]).map((s) => ({ id: s.id, label: `${s.classrooms?.name ?? "—"} · ${s.nickname ? `${s.nickname} ` : ""}${s.first_name} ${s.last_name}`.trim() }));
  let guardians: { id: string; label: string }[] = [];
  if (sp.success) {
    const { data: links } = await a.from("guardian_links").select("user_id,relation").eq("school_id", school.id).eq("student_id", sp.data).in("status", ["approved", "pending"]);
    const ids = (links ?? []).map((l) => l.user_id);
    const { data: profs } = ids.length ? await a.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
    const name = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
    guardians = (links ?? []).map((l) => ({ id: l.user_id, label: `${name.get(l.user_id) || "—"}${l.relation ? ` (${l.relation})` : ""}` }));
  }
  const rows = (flags.data ?? []) as unknown as { id: string; kind: string; note: string | null; active: boolean; created_at: string; students: { first_name: string; nickname: string | null; classrooms: { name: string } | null } | null }[];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.custody_title} lead={t.custody_lead} school={schoolName(school, lang)} />
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-soft">{t.custody_privacy}</p>
      <Card title={t.custody_add}>
        <StudentPickForm students={opts} value={sp.success ? sp.data : ""} />
        {sp.success && <CustodyForm key={sp.data} student={sp.data} guardians={guardians} />}
      </Card>
      <Card title={t.custody_active}>
        {rows.filter((r) => r.active).length === 0 ? <p className="text-ink-soft">{t.custody_empty}</p> : (
          <ul className="space-y-2" data-testid="custody-list">
            {rows.filter((r) => r.active).map((r) => (
              <li key={r.id} className="space-y-1 rounded-xl border border-danger bg-danger-bg p-3">
                <p className="font-semibold">{r.students?.nickname || r.students?.first_name} {r.students?.classrooms?.name && <span className="text-ink-soft">· {r.students.classrooms.name}</span>}</p>
                <p className="text-sm">{r.kind === "hold_all" ? t.custody_kind_hold : t.custody_kind_block} · {fmtDate(r.created_at, lang)}</p>
                {r.note && <p className="text-sm text-ink-soft">{r.note}</p>}
                <AsyncForm action={endCustodyFlagAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="secondary">{t.custody_end}</SubmitButton>
                </AsyncForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
