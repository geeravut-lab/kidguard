import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/** กุญแจจาก env APP_ENCRYPTION_KEY (base64 ความยาว 32 ไบต์) — ฝั่ง server เท่านั้น */
function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY ?? "";
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("app_encryption_key_invalid");
  return k;
}

/** AES-256-GCM: รูปแบบ v1:<iv>:<tag>:<ciphertext> (base64url) — ใช้เก็บ channel secret / access token ของ LINE */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(":");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, enc] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("secret_format_invalid");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8"); // แก้ไฟล์/คีย์ผิด = throw
}

/** HMAC ของรหัสผูก LINE (ไม่เก็บรหัสจริง) — ผูกกับโรงเรียนเพื่อไม่ให้ชนข้ามโรงเรียน */
export function hmacCode(schoolId: string, code: string): string {
  return createHmac("sha256", key()).update(`${schoolId}:${code.trim().toUpperCase()}`).digest("hex");
}
