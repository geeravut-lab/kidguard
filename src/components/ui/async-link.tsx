"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { Spinner } from "./spinner";

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className="ms-1" label="…" /> : null;
}

/** ลิงก์ภายใน: แสดงสปินเนอร์ระหว่างรอเปลี่ยนหน้า */
export function AsyncLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <Pending />
    </Link>
  );
}
