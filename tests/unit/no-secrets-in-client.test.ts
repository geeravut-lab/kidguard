import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// กติกาข้อ 4 / SSO doc: service_role ต้องไม่หลุดไป client — ตรวจ build output (ต้อง build ก่อน)
describe.skipIf(!existsSync(".next/static"))("build output ฝั่ง client", () => {
  it("ไม่มี service_role / SUPABASE_SERVICE อยู่ใน .next/static เลย", () => {
    let found = "";
    try {
      found = execSync('grep -rliE "service_role|SUPABASE_SERVICE" .next/static', { encoding: "utf8" });
    } catch {
      found = ""; // grep exit 1 = ไม่พบ (ที่ต้องการ)
    }
    expect(found).toBe("");
  });
});
