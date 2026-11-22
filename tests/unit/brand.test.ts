import { describe, expect, it } from "vitest";
import { applyBrandNames, DEFAULT_BRAND, parseBrand, validBrandName } from "@/lib/brand/brand";

describe("validBrandName", () => {
  it("รับชื่อปกติและภาษาไทย", () => {
    expect(validBrandName("KidGuard")).toBe(true);
    expect(validBrandName("รับส่งปลอดภัย")).toBe(true);
  });
  it("ปฏิเสธว่าง/ยาวเกิน/มี < > หรืออักขระควบคุม/ขึ้นบรรทัดใหม่", () => {
    expect(validBrandName("   ")).toBe(false);
    expect(validBrandName("a".repeat(41))).toBe(false);
    expect(validBrandName("<b>x</b>")).toBe(false);
    expect(validBrandName("a\nb")).toBe(false);
    expect(validBrandName("a\u0000b")).toBe(false);
  });
});

describe("parseBrand (ใจกว้าง)", () => {
  it("ข้อมูลเสีย/ว่าง → ค่าเริ่มต้น", () => {
    expect(parseBrand(null)).toEqual(DEFAULT_BRAND);
    expect(parseBrand("x")).toEqual(DEFAULT_BRAND);
    expect(parseBrand({ name_th: 5, name_en: "<x>" })).toEqual(DEFAULT_BRAND);
  });
  it("ช่องที่ถูกต้องถูกใช้ ช่องที่เสียใช้ค่าเริ่มต้น", () => {
    expect(parseBrand({ name_th: "ปลอดภัย", name_en: "" })).toEqual({ name_th: "ปลอดภัย", name_en: DEFAULT_BRAND.name_en });
  });
});

describe("applyBrandNames", () => {
  it("ชื่อเริ่มต้น → คืนข้อความเดิม", () => {
    expect(applyBrandNames("ยินดีต้อนรับสู่ KidGuard", DEFAULT_BRAND, "th")).toBe("ยินดีต้อนรับสู่ KidGuard");
  });
  it("สลับครั้งเดียว ไม่สลับซ้ำเมื่อชื่อใหม่มีชื่อเดิมอยู่ข้างใน และไม่ตีความ $ ในชื่อ", () => {
    expect(applyBrandNames("KidGuard และ KidGuard", { name_th: "A KidGuard", name_en: "z" }, "th")).toBe("A KidGuard และ A KidGuard");
    expect(applyBrandNames("x KidGuard", { name_th: "a$&b", name_en: "z" }, "th")).toBe("x a$&b");
  });
});
