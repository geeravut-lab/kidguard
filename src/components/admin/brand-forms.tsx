"use client";

import { Upload, Undo2 } from "lucide-react";
import { clearBrandImageAction, clearSchoolLogoAction, saveBrandNamesAction, uploadBrandImageAction, uploadSchoolLogoAction } from "@/app/actions/admin";
import { FormMessage, TextField, inputClass } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export function BrandNamesForm({ nameTh, nameEn }: { nameTh: string; nameEn: string }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(saveBrandNamesAction);
  return (
    <AsyncForm ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <TextField label={t.brand_name_th} name="name_th" defaultValue={nameTh} required maxLength={40} hint={t.brand_name_hint} autoComplete="off" />
      <TextField label={t.brand_name_en} name="name_en" defaultValue={nameEn} required maxLength={40} autoComplete="off" />
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
      <div>
        <SubmitButton variant="secondary">{t.brand_names_save}</SubmitButton>
      </div>
    </AsyncForm>
  );
}

/** อัปโหลดรูปแบรนด์ (แพลตฟอร์ม: logo/favicon; โรงเรียน: โลโก้) + ปุ่มกลับไปใช้รูปในตัว */
export function ImageForm({ kind, scope, src, custom, label, hint, accept }: { kind: "logo" | "favicon"; scope: "platform" | "school"; src: string; custom: boolean; label: string; hint: string; accept: string }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(scope === "school" ? uploadSchoolLogoAction : uploadBrandImageAction);
  const id = `img-${scope}-${kind}`;
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={64} height={64} className="size-16 rounded-lg border border-line bg-white object-contain" />
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-ink-soft">{custom ? t.brand_current : t.brand_default_img}</p>
        </div>
      </div>
      <AsyncForm ref={ref} action={action} className="space-y-3">
        <input type="hidden" name="kind" value={kind} />
        <div className="space-y-1.5">
          <label htmlFor={id} className="block text-sm font-medium">
            {t.brand_pick_file}
          </label>
          <input id={id} name="file" type="file" accept={accept} required className={inputClass + " py-2.5"} />
          <p className="text-xs text-ink-soft">{hint}</p>
        </div>
        <FormMessage state={state} />
        <SubmitButton variant="secondary" size="sm" leading={<Upload className="size-4" aria-hidden="true" />}>
          {t.brand_upload}
        </SubmitButton>
      </AsyncForm>
      {custom && (
        <AsyncForm action={scope === "school" ? clearSchoolLogoAction : clearBrandImageAction}>
          <input type="hidden" name="kind" value={kind} />
          <SubmitButton variant="ghost" size="sm" leading={<Undo2 className="size-4" aria-hidden="true" />}>
            {t.brand_reset}
          </SubmitButton>
        </AsyncForm>
      )}
    </div>
  );
}
