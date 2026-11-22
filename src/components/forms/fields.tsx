"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AsyncButton } from "@/components/ui";
import { errorText, type ActionState } from "@/lib/action";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

export const inputClass =
  "block w-full min-h-12 rounded-xl border border-line bg-surface px-4 text-base text-ink placeholder:text-ink-soft/70 " +
  "focus-visible:outline-3 disabled:opacity-60";

export function Field({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function TextField({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      <input id={id} className={cn(inputClass, className)} {...rest} />
    </Field>
  );
}

export function PasswordField({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint} id={id}>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} className={cn(inputClass, "pe-14")} {...rest} />
        <AsyncButton
          variant="ghost"
          size="icon"
          className="absolute end-1 top-1/2 -translate-y-1/2"
          aria-label={show ? t.auth_hide_password : t.auth_show_password}
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
          leading={show ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        >
          <span className="sr-only">{show ? t.auth_hide_password : t.auth_show_password}</span>
        </AsyncButton>
      </div>
    </Field>
  );
}

export function SelectField({ label, id, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string }) {
  return (
    <Field label={label} id={id}>
      <select id={id} className={cn(inputClass, "pe-8")} {...rest}>
        {children}
      </select>
    </Field>
  );
}

/** ข้อความผลลัพธ์ของ action (แปลจากรหัส err_* / message key) */
export function FormMessage({ state }: { state: ActionState }) {
  const { t } = useI18n();
  if (!state) return null;
  if (!state.ok) {
    return (
      <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
        {errorText(t, state.error)}
      </p>
    );
  }
  if (state.message) {
    const text = (t as Record<string, string>)[state.message];
    return (
      <p role="status" className="rounded-xl bg-success-bg px-4 py-3 text-sm font-medium text-success">
        {text ?? t.profile_saved}
      </p>
    );
  }
  return null;
}
