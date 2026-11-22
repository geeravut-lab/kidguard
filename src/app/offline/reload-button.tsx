"use client";

import { AsyncButton } from "@/components/ui";

export function ReloadButton({ label }: { label: string }) {
  return (
    <AsyncButton
      onClick={async () => {
        location.reload();
        await new Promise(() => {}); // คงสปินเนอร์จนหน้าโหลดใหม่
      }}
    >
      {label}
    </AsyncButton>
  );
}
