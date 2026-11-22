"use client";

import { useActionState } from "react";
import { redeemInviteAction } from "@/app/actions/invite";
import { FormMessage } from "@/components/forms/fields";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export function InviteForm({ code }: { code: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState(redeemInviteAction, null);
  return (
    <AsyncForm action={action} className="space-y-4">
      <input type="hidden" name="code" value={code} />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        {t.invite_accept}
      </SubmitButton>
    </AsyncForm>
  );
}
