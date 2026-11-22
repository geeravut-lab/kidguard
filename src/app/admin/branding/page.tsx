import { ImageForm } from "@/components/admin/brand-forms";
import { Card } from "@/components/parent/sections";
import { PageHead, schoolName } from "@/components/staff/page-head";
import { AsyncLink } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { requireSchoolRole } from "@/lib/auth/guards";
import { brandImageUrl, parseImageRef } from "@/lib/brand/brand";
import { getT } from "@/lib/i18n/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "ชื่อและโลโก้โรงเรียน", robots: { index: false } };

export default async function SchoolBrandingPage() {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/branding");
  const { lang, t } = await getT();
  const { data } = await supabaseAdmin().from("schools").select("logo").eq("id", school.id).maybeSingle();
  const logo = parseImageRef(data?.logo);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.brand_school_title} lead={t.brand_school_lead} school={schoolName(school, lang)} />
      <Card title={t.brand_logo} lead={t.brand_applies}>
        <ImageForm kind="logo" scope="school" src={brandImageUrl(`/brand/school/${school.id}`, logo)} custom={!!logo} label={t.brand_logo} hint={t.brand_logo_hint} accept="image/png,image/jpeg,image/webp" />
      </Card>
      <Card title={schoolName(school, lang)} lead={t.brand_school_names_hint}>
        <AsyncLink href="/admin/settings" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {t.brand_school_names_link}
        </AsyncLink>
      </Card>
    </div>
  );
}
