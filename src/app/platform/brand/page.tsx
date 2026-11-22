import { BrandNamesForm, ImageForm } from "@/components/admin/brand-forms";
import { Card } from "@/components/parent/sections";
import { PageHead } from "@/components/staff/page-head";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { brandImageUrl } from "@/lib/brand/brand";
import { loadBrand } from "@/lib/brand/server";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "แบรนด์แพลตฟอร์ม", robots: { index: false } };

export default async function PlatformBrandPage() {
  await requirePlatformAdmin("/platform/brand");
  const { t } = await getT();
  const brand = await loadBrand();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.brand_platform_title} lead={t.brand_platform_lead} />
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-soft">{t.brand_applies}</p>
      <Card title={t.brand_names}>
        <BrandNamesForm nameTh={brand.name_th} nameEn={brand.name_en} />
      </Card>
      <Card title={t.brand_logo}>
        <ImageForm kind="logo" scope="platform" src={brandImageUrl("/brand/logo", brand.logo)} custom={!!brand.logo} label={t.brand_logo} hint={t.brand_logo_hint} accept="image/png,image/jpeg,image/webp" />
      </Card>
      <Card title={t.brand_favicon}>
        <ImageForm kind="favicon" scope="platform" src={brandImageUrl("/brand/favicon", brand.favicon)} custom={!!brand.favicon} label={t.brand_favicon} hint={t.brand_favicon_hint} accept="image/png" />
      </Card>
    </div>
  );
}
