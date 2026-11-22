"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action";

/**
 * useActionState + จำค่าที่กรอกไว้เมื่อ action ล้มเหลว
 * (React 19 ล้างช่องกรอกทุกครั้งหลัง action จบ แม้ผิดพลาด — ผู้ใช้จะต้องพิมพ์ใหม่ทั้งหมด)
 * ช่องรหัสผ่านไม่ถูกคืนค่า
 */
export function useFormAction(serverAction: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const [state, formAction] = useActionState(serverAction, null as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  const saved = useRef<[string, string][]>([]);

  const action = useCallback(
    (fd: FormData) => {
      saved.current = [...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string");
      return formAction(fd);
    },
    [formAction],
  );

  useEffect(() => {
    const form = ref.current;
    if (!form || !state || state.ok) return;
    for (const [name, value] of saved.current) {
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement && el.type !== "password" && el.type !== "hidden" && el.type !== "checkbox") el.value = value;
      else if (el instanceof HTMLTextAreaElement) el.value = value;
    }
  }, [state]);

  return { state, action, ref };
}
