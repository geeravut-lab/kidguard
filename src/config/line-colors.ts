/** สีของการ์ด LINE (ค่า hex อยู่ไฟล์เดียว; ตรงกับธีมของแอป) — ดู docs/LINE-FLEX-CARD-KNOWLEDGE.md */
export type Tone = "info" | "success" | "warning" | "danger";

export const LINE_COLORS = {
  title: { info: "#0B6E8A", success: "#1F7A52", warning: "#B26A00", danger: "#B42D2D" } satisfies Record<Tone, string>,
  text: "#12303B",
  label: "#4A6572",
  button: "#0B6E8A",
} as const;
