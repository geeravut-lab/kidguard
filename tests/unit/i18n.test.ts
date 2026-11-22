import { describe, expect, it } from "vitest";
import { en, fmt, th } from "@/lib/i18n/dict";
import { brandedDict } from "@/lib/i18n/server";

const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("พจนานุกรม i18n", () => {
  it("คีย์ไทยและอังกฤษตรงกันทุกตัว", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(th).sort());
  });
  it("ไม่มีข้อความว่าง", () => {
    for (const [k, v] of [...Object.entries(th), ...Object.entries(en)]) expect(v.trim().length, k).toBeGreaterThan(0);
  });
  it("placeholder {name} ตรงกันทั้งสองภาษา", () => {
    for (const k of Object.keys(th) as (keyof typeof th)[]) expect(ph(en[k]), k).toBe(ph(th[k]));
  });
  it("fmt แทนค่าและคง placeholder ที่ไม่มีค่า", () => {
    expect(fmt("{a} กับ {b}", { a: 1 })).toBe("1 กับ {b}");
  });
  it("brandedDict สลับชื่อแอปทุกที่ (ชื่อใหม่ที่มีชื่อเดิมอยู่ข้างใน ไม่ถูกสลับซ้ำ)", () => {
    const d = brandedDict("en", { name_th: "X", name_en: "My KidGuard Plus" });
    expect(d.home_lead.includes("My KidGuard Plus")).toBe(true);
    expect(d.home_lead.includes("My My KidGuard")).toBe(false);
  });
});
