import { createHash, randomInt } from "node:crypto";

const SAFE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ไม่มี 0/O/1/I (กันอ่านผิด)

/** รหัสเชิญ 16 ตัว (~80 บิต) สุ่มด้วย crypto.randomInt */
export function makeInviteCode(): string {
  return Array.from({ length: 16 }, () => SAFE[randomInt(SAFE.length)]).join("");
}

/** hash เดียวกับที่ฟังก์ชัน SQL redeem_invite คำนวณ (sha256 ของตัวพิมพ์ใหญ่) */
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export const INVITE_TTL_DAYS = 7;
export const INVITE_CODE_RE = /^[A-Za-z0-9]{8,40}$/;
