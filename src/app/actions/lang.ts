"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLang } from "@/lib/i18n/dict";
import { LANG_COOKIE } from "@/lib/i18n/server";

export async function setLang(formData: FormData) {
  const lang = formData.get("lang");
  if (!isLang(lang)) return; // ค่าแปลกปลอม: เพิกเฉย (ไม่ throw ใส่ผู้ใช้)
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  revalidatePath("/", "layout");
}
