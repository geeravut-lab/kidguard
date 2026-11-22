import type { NextRequest } from "next/server";
import { loadBrand, serveBrandImage } from "@/lib/brand/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return serveBrandImage(req, (await loadBrand()).favicon, "favicon", "/icons/favicon-32.png");
}
