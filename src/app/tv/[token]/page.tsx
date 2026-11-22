import { notFound } from "next/navigation";
import { after } from "next/server";
import { TvBoard } from "@/components/pickup/tv-board";
import { brandImageUrl, parseImageRef } from "@/lib/brand/brand";
import { getT } from "@/lib/i18n/server";
import { findTv, loadTvState, touchTv } from "@/lib/safety/tv";

export const metadata = { title: "จอ TV", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** จอ TV (เปิดด้วยลิงก์ลับ ไม่ต้องล็อกอิน): โทเคนผิด/ถูกยกเลิก/ปิดฟีเจอร์ = 404 */
export default async function TvPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await findTv(token);
  if (!d) notFound();
  const { lang } = await getT();
  const { state, showArriving, voice, school } = await loadTvState(d);
  after(() => touchTv(d));
  const name = school ? (lang === "en" && school.name_en ? school.name_en : school.name_th) : "";
  const logo = parseImageRef(school?.logo);
  return <TvBoard state={state} token={token} schoolName={name} logoSrc={logo ? brandImageUrl(`/brand/school/${d.school_id}`, logo) : "/brand/logo"} showArriving={showArriving} voice={voice} />;
}
