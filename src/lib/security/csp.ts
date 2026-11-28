// Content-Security-Policy แบบ nonce ต่อคำขอ (เฟส 7): สคริปต์ inline ต้องมี nonce ของคำขอนั้น + 'strict-dynamic'
// (ไม่มี 'unsafe-inline' สำหรับสคริปต์) — style ยังต้อง 'unsafe-inline' เพราะ React ใส่ style="" ตามค่า
export function makeNonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function buildCsp(opts: { nonce: string; supabaseHost?: string; dev?: boolean }): string {
  const sb = opts.supabaseHost ? ` https://${opts.supabaseHost}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${opts.nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://tile.openstreetmap.org${sb}`,
    "font-src 'self' data:",
    `connect-src 'self'${sb}${opts.supabaseHost ? ` wss://${opts.supabaseHost}` : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
