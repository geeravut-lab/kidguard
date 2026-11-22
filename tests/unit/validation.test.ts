import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/next";
import { parseCsv, parseStudentRows } from "@/lib/csv";
import { hashInviteCode, makeInviteCode } from "@/lib/invites";
import { cleanDetail } from "@/lib/audit/server";
import { mapDbError } from "@/lib/action";
import { normalizePhone, normalizePlate } from "@/lib/validation";

describe("safeNext (กัน open redirect)", () => {
  it("รับ path ภายใน", () => {
    expect(safeNext("/home")).toBe("/home");
    expect(safeNext("/admin/students?room=1")).toBe("/admin/students?room=1");
  });
  it("ปฏิเสธลิงก์นอก/โปรโตคอลสัมพัทธ์/แบ็กสแลช/อักขระควบคุม/ยาวเกิน → ค่าเริ่มต้น", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/a\nb", "x", "", null, undefined, "/" + "a".repeat(400)]) {
      expect(safeNext(bad as string | null)).toBe("/start");
    }
  });
});

describe("normalizePhone / normalizePlate", () => {
  it("เบอร์โทร", () => {
    expect(normalizePhone("081-234 5678")).toBe("0812345678");
    expect(normalizePhone("+66 81 234 5678")).toBe("+66812345678");
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
  it("ทะเบียน", () => {
    expect(normalizePlate("กข 1234")).toBe("กข1234");
    expect(normalizePlate("1กข-2345")).toBe("1กข2345");
    expect(normalizePlate("<script>")).toBeNull();
    expect(normalizePlate("")).toBeNull();
  });
});

describe("CSV นักเรียน", () => {
  it("แยกช่องที่มีคอมมาและเครื่องหมายคำพูด, ลบ BOM, รองรับ CRLF", () => {
    expect(parseCsv('﻿a,"b,c",d\r\n"x ""y""",2,3\n')).toEqual([["a", "b,c", "d"], ['x "y"', "2", "3"]]);
  });
  it("ตัดหัวตารางอัตโนมัติ และรายงานแถวที่ผิดพร้อมเลขแถวจริง", () => {
    const r = parseStudentRows("รหัส,ชื่อ,นามสกุล,ชื่อเล่น,ห้อง\n001,ภูมิ,ใจดี,ภู,ป.1/1\n002,,รักดี,,ป.1/1\n003,มะลิ,สุข,,\n");
    expect(r.rows.map((x) => [x.row, x.data.first, x.data.classroom])).toEqual([[2, "ภูมิ", "ป.1/1"]]);
    expect(r.errors).toEqual([{ row: 3, reason: "missing_name" }, { row: 4, reason: "missing_classroom" }]);
  });
  it("ไม่มีหัวตาราง: เลขแถวเริ่มที่ 1", () => {
    expect(parseStudentRows("001,ภูมิ,ใจดี,,ป.1/1").rows[0]!.row).toBe(1);
  });
});

describe("รหัสเชิญ", () => {
  it("16 ตัว ไม่มีตัวอักษรสับสน ไม่ซ้ำกัน และ hash ไม่สนตัวพิมพ์", () => {
    const codes = new Set(Array.from({ length: 200 }, makeInviteCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
    const c = [...codes][0]!;
    expect(hashInviteCode(c.toLowerCase())).toBe(hashInviteCode(c));
    expect(hashInviteCode(c)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("audit cleanDetail (ไม่มีข้อมูลส่วนบุคคล)", () => {
  it("ทิ้ง key ที่สื่อถึง PII/ความลับ และ object ซ้อน, ตัดสตริงยาว", () => {
    const out = cleanDetail({ id: "a", email: "x@y.z", phone: "081", plate: "กข1", password: "p", token: "t", note: "n", inviteCode: "c", nested: { a: 1 }, role: "r".repeat(300), n: 5, ok: true, list: ["a", { b: 1 }, 2] });
    expect(Object.keys(out).sort()).toEqual(["id", "list", "n", "ok", "role"]);
    expect((out.role as string).length).toBe(120);
    expect(out.list).toEqual(["a", 2]);
  });
});

describe("mapDbError", () => {
  it("แปลง error ของ Postgres เป็นรหัส err_*", () => {
    expect(mapDbError({ message: "invalid_invite" })).toBe("err_invalid_invite");
    expect(mapDbError({ code: "42501" })).toBe("err_forbidden");
    expect(mapDbError({ code: "23505" })).toBe("err_duplicate");
    expect(mapDbError({ message: "rate_limited" })).toBe("err_rate_limited");
    expect(mapDbError({ message: "ข้อความแปลก ๆ ที่ไม่รู้จัก" })).toBe("err_generic");
  });
});
