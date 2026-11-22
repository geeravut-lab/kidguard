import { WifiOff } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { ReloadButton } from "./reload-button";

export const metadata = { robots: { index: false } };

export default async function OfflinePage() {
  const { t } = await getT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <WifiOff className="size-14 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-bold">{t.offline_title}</h1>
      <p className="text-ink-soft">{t.offline_body}</p>
      <ReloadButton label={t.offline_retry} />
    </div>
  );
}
