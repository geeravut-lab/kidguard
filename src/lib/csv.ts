/** แยก CSV แบบรองรับเครื่องหมายคำพูด/คอมมาในช่อง/ขึ้นบรรทัดใหม่ (RFC 4180 แบบย่อ) ลบ BOM ให้ */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
  return rows;
}

export type StudentRow = { code: string | null; first: string; last: string; nickname: string | null; classroom: string };

const HEADER_HINTS = new Set(["ชื่อ", "first_name", "firstname", "first name", "name"]);

/** คอลัมน์: รหัสนักเรียน, ชื่อ, นามสกุล, ชื่อเล่น, ห้อง — ตัดบรรทัดหัวตารางออกอัตโนมัติ */
export function parseStudentRows(text: string): { rows: { row: number; data: StudentRow }[]; errors: { row: number; reason: "missing_name" | "missing_classroom" | "too_long" }[] } {
  const all = parseCsv(text);
  const body = all.length > 0 && HEADER_HINTS.has((all[0]![1] ?? "").toLowerCase()) ? all.slice(1) : all;
  const offset = body.length === all.length ? 1 : 2;
  const rows: { row: number; data: StudentRow }[] = [];
  const errors: { row: number; reason: "missing_name" | "missing_classroom" | "too_long" }[] = [];
  body.forEach((c, i) => {
    const row = i + offset;
    const [code = "", first = "", last = "", nick = "", classroom = ""] = c;
    if (!first) return void errors.push({ row, reason: "missing_name" });
    if (!classroom) return void errors.push({ row, reason: "missing_classroom" });
    if (first.length > 80 || last.length > 80 || nick.length > 30 || code.length > 30) return void errors.push({ row, reason: "too_long" });
    rows.push({ row, data: { code: code || null, first, last, nickname: nick || null, classroom } });
  });
  return { rows, errors };
}
