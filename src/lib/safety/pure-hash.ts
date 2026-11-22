import { createHash } from "node:crypto";

/** hash ของโทเคนจอ TV (ไม่พึ่ง server-only จึงเรียกจากเทสต์ได้) */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
