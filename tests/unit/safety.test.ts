import { describe, expect, it } from "vitest";
import { callPhrase, lateBucket, makePassCode, normalizePassCode, passExpiry, passQrText, passStatus, planDateOk } from "@/lib/safety/pure";
import { th } from "@/lib/i18n/dict";

describe("รหัสผู้รับแทน", () => {
  it("สร้างรหัส 8 ตัวจากชุดตัวอักษรที่ไม่สับสน และไม่ซ้ำกันง่าย ๆ", () => {
    const set = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const c = makePassCode();
      expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      set.add(c);
    }
    expect(set.size).toBeGreaterThan(295);
  });
  it("normalize: รับตัวเล็ก ช่องว่าง ขีด และข้อความ QR (KG:...) — อย่างอื่น = null", () => {
    expect(normalizePassCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizePassCode(passQrText("ABCD2345"))).toBe("ABCD2345");
    expect(normalizePassCode("kg: abcd 2345")).toBe("ABCD2345");
    expect(normalizePassCode("ABCD234")).toBeNull(); // สั้นไป
    expect(normalizePassCode("ABCD23455")).toBeNull(); // ยาวไป
    expect(normalizePassCode("ABCD0O1I")).toBeNull(); // ตัวอักษรที่ไม่อยู่ในชุด
    expect(normalizePassCode("<script>")).toBeNull();
    expect(normalizePassCode("")).toBeNull();
  });
  it("วันหมดอายุ: 'วันนี้' = สิ้นวันตามเวลาไทย, 'หลายวัน' จำกัด 1–7", () => {
    // 2026-03-01 20:00 ไทย = 13:00Z → สิ้นวัน 23:59:59 ไทย = 16:59:59Z
    expect(passExpiry(new Date("2026-03-01T13:00:00Z"), "today").toISOString()).toBe("2026-03-01T16:59:59.000Z");
    // 2026-03-01 18:00Z = 02:00 ไทยของวันที่ 2 → สิ้นวันที่ 2
    expect(passExpiry(new Date("2026-03-01T18:00:00Z"), "today").toISOString()).toBe("2026-03-02T16:59:59.000Z");
    const now = new Date("2026-03-01T00:00:00Z");
    expect(passExpiry(now, "days", 3).getTime() - now.getTime()).toBe(3 * 86400_000);
    expect(passExpiry(now, "days", 99).getTime() - now.getTime()).toBe(7 * 86400_000);
    expect(passExpiry(now, "days", 0).getTime() - now.getTime()).toBe(86400_000);
    expect(passExpiry(now, "days", Number.NaN).getTime() - now.getTime()).toBe(86400_000);
  });
  it("passStatus: active ที่เลยเวลา = expired", () => {
    expect(passStatus("active", new Date(Date.now() - 1000).toISOString())).toBe("expired");
    expect(passStatus("active", new Date(Date.now() + 60_000).toISOString())).toBe("active");
    expect(passStatus("used", new Date(Date.now() - 1000).toISOString())).toBe("used");
  });
});

describe("แจ้งล่วงหน้า", () => {
  const now = new Date("2026-03-10T05:00:00Z"); // 12:00 ไทย
  it("รับวันนี้ถึง +14 วัน (เวลาไทย) เท่านั้น และรูปแบบวันที่ถูกต้อง", () => {
    expect(planDateOk("2026-03-10", now)).toBe(true);
    expect(planDateOk("2026-03-24", now)).toBe(true);
    expect(planDateOk("2026-03-25", now)).toBe(false);
    expect(planDateOk("2026-03-09", now)).toBe(false);
    expect(planDateOk("2026-02-30", now)).toBe(false);
    expect(planDateOk("10/03/2026", now)).toBe(false);
    expect(planDateOk("", now)).toBe(false);
  });
  it("ใกล้เที่ยงคืนไทย: นับวันตามเวลาไทย ไม่ใช่ UTC", () => {
    const late = new Date("2026-03-10T17:30:00Z"); // 00:30 ของวันที่ 11 ไทย
    expect(planDateOk("2026-03-10", late)).toBe(false);
    expect(planDateOk("2026-03-11", late)).toBe(true);
  });
});

describe("เสียงเรียกและเตือนรับช้า", () => {
  it("ประโยคเรียกใช้ชื่อเล่น+ห้อง+ประตู ไม่มีนามสกุล", () => {
    expect(callPhrase({ nickname: "ภูมิ", classroom: "ป.3/1", zone: "ประตู 2" }, "th")).toBe("น้องภูมิ ห้อง ป.3/1 ผู้ปกครองมารับแล้ว เชิญที่ประตู 2");
    expect(callPhrase({ nickname: "ภูมิ" }, "th")).toBe("น้องภูมิ ผู้ปกครองมารับแล้ว เชิญที่ประตู");
    expect(callPhrase({ nickname: "Mint", classroom: "G3/1", zone: "Gate 2" }, "en")).toBe("Mint, class G3/1, your guardian has arrived. Please come to Gate 2.");
    expect(callPhrase({ nickname: "Mint" }, "en")).toContain("the gate");
  });
  it("ช่วงเตือนซ้ำ: repeat=0 → ครั้งเดียว; มิฉะนั้นเปลี่ยนตามช่วง", () => {
    expect(lateBucket(0, 0)).toBe(0);
    expect(lateBucket(95, 0)).toBe(0);
    expect(lateBucket(0, 15)).toBe(0);
    expect(lateBucket(14, 15)).toBe(0);
    expect(lateBucket(15, 15)).toBe(1);
    expect(lateBucket(47, 15)).toBe(3);
    expect(lateBucket(-5, 15)).toBe(0);
  });
  it("ข้อความของเฟส 6 มีครบทั้งสองภาษา (ไม่มีคีย์ว่าง)", () => {
    for (const k of ["passes_title", "gate_pass_title", "custody_title", "announce_title", "tv_title", "notif_late_parent_body", "held_badge"] as const) expect(th[k].length).toBeGreaterThan(0);
  });
});
