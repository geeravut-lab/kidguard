import { ArrowLeft } from "lucide-react";
import { AsyncLink } from "@/components/ui";
import { fmt, type Dict, type DictKey } from "@/lib/i18n/dict";

/** "กลับไป <หน้าแม่>" บนสุดของเนื้อหา — ทุกหน้าที่ไม่ใช่เมนูหลักต้องมี */
export function BackLink({ href, labelKey, t }: { href: string; labelKey: DictKey; t: Dict }) {
  return (
    <AsyncLink href={href} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {fmt(t.nav_back_to, { page: t[labelKey] })}
    </AsyncLink>
  );
}
