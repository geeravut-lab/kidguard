"use client";

import { useEffect } from "react";

/** ลงทะเบียน service worker (เฉพาะ production) — sw.js แคชเฉพาะ /offline กับไอคอน ไม่แคชข้อมูลผู้ใช้ */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* ติดตั้งแอปไม่ได้ ไม่กระทบการใช้งานปกติ */
    });
  }, []);
  return null;
}
