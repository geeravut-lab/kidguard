import { SearchX } from "lucide-react";
import { AsyncLink } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <SearchX className="size-14 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-bold">{t.not_found_title}</h1>
      <p className="text-ink-soft">{t.not_found_body}</p>
      <AsyncLink href="/" className={buttonVariants({ variant: "primary" })}>
        {t.not_found_home}
      </AsyncLink>
    </div>
  );
}
