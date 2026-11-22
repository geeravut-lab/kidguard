"use client";

import { useRef, useState, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";
import { useI18n } from "@/lib/i18n/client";

type Props = Omit<ButtonProps, "onClick" | "busy"> & {
  /** ฟังก์ชันที่อาจช้า (Promise) — สปินเนอร์แสดงจนกว่าจะเสร็จ และกดซ้ำไม่ได้ */
  onClick: (e: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
};

/** ปุ่มที่ครอบงาน async: กันกดซ้ำแบบ synchronous (ref) ก่อนที่ state จะ render */
export function AsyncButton({ onClick, ...props }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function handle(e: MouseEvent<HTMLButtonElement>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await onClick(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <Button {...props} busy={busy} busyLabel={t.common_loading} onClick={handle} />;
}

/** ปุ่ม submit ของ <AsyncForm>/server action: สปินเนอร์ขณะ form pending */
export function SubmitButton({ disabled, ...props }: Omit<ButtonProps, "type" | "busy" | "onClick">) {
  const { t } = useI18n();
  const { pending, data } = useFormStatus();
  // ฟอร์มที่มีหลายปุ่ม (name/value): หมุนเฉพาะปุ่มที่ถูกกด, ปุ่มอื่นถูกปิดไม่ให้กดซ้อน
  const mine = props.name && props.value !== undefined ? data?.get(props.name) === String(props.value) : true;
  return <Button {...props} type="submit" busy={pending && mine} disabled={disabled || (pending && !mine)} busyLabel={t.common_loading} />;
}
