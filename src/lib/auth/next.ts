/** อนุญาตเฉพาะ path ภายในของเรา (กัน open redirect): ขึ้นต้น "/" ไม่ใช่ "//" ไม่มี "\" หรืออักขระควบคุม ยาว ≤ 300 */
export function safeNext(value: string | null | undefined, fallback = "/start"): string {
  if (!value || value.length > 300) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
