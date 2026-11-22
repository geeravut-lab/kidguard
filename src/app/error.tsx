"use client";

import { TriangleAlert } from "lucide-react";
import { AsyncButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <TriangleAlert className="size-14 text-warn" aria-hidden="true" />
      <h1 className="text-2xl font-bold">{t.error_title}</h1>
      <p className="text-ink-soft">{t.error_body}</p>
      <AsyncButton onClick={() => reset()}>{t.error_retry}</AsyncButton>
    </div>
  );
}
