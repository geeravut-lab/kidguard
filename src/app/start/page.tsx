import { redirect } from "next/navigation";
import { postLoginPath } from "@/lib/auth/me";
import { requireMe } from "@/lib/auth/guards";

export const metadata = { robots: { index: false } };

/** ตัวกระจายหลังล็อกอิน: ส่งไปหน้าตามบทบาท */
export default async function StartPage() {
  const me = await requireMe("/start");
  redirect(postLoginPath(me));
}
