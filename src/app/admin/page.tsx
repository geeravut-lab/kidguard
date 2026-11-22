import { ClaimCards, type ClaimRow, type StudentOption } from "@/components/staff/claim-cards";
import { PageHead, schoolName } from "@/components/staff/page-head";
import { AsyncLink } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { requireSchoolRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "คำขอผูกนักเรียน", robots: { index: false } };

export default async function AdminApprovalsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { school } = await requireSchoolRole(["school_admin"], "/admin");
  const all = (await searchParams).show === "all";
  const { lang, t } = await getT();
  const supabase = await createClient();
  const [claims, students] = await Promise.all([
    supabase.rpc("school_claims", { p_school: school.id, p_status: all ? null : "pending" }),
    supabase.from("students").select("id,first_name,last_name,classroom_id").eq("school_id", school.id).eq("status", "active").order("first_name").limit(3000),
  ]);
  const options: StudentOption[] = (students.data ?? []).map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`.trim(), classroom_id: s.classroom_id }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title={t.claims_title}
        lead={t.claims_lead}
        school={schoolName(school, lang)}
        actions={
          <AsyncLink href={all ? "/admin" : "/admin?show=all"} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {all ? t.claims_filter_pending : t.claims_filter_all}
          </AsyncLink>
        }
      />
      <ClaimCards claims={(claims.data ?? []) as ClaimRow[]} students={options} />
    </div>
  );
}
