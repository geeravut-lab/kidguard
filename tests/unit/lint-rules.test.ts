import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

// กติกาข้อ 3: ปุ่ม/ฟอร์ม/ลิงก์ดิบนอกคอมโพเนนต์กลางต้องถูก ESLint ปฏิเสธ
async function lint(code: string, filePath: string) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [res] = await eslint.lintText(code, { filePath });
  return res?.messages.filter((m) => m.ruleId === "no-restricted-syntax") ?? [];
}

describe("กฎ lint กันปุ่มที่ไม่มีสปินเนอร์", () => {
  it("<button> ดิบในหน้าทั่วไป → error", async () => {
    const m = await lint("export default function P(){ return <button onClick={()=>{}}>x</button>; }", "src/app/x/page.tsx");
    expect(m.length).toBe(1);
  });
  it("<form> ดิบ → error", async () => {
    const m = await lint("export default function P(){ return <form action={()=>{}}></form>; }", "src/app/x/page.tsx");
    expect(m.length).toBe(1);
  });
  it("<a href='/...'> ภายใน → error", async () => {
    const m = await lint("export default function P(){ return <a href='/x'>x</a>; }", "src/app/x/page.tsx");
    expect(m.length).toBe(1);
  });
  it("ลิงก์ภายนอกและ anchor # ใช้ได้", async () => {
    const m = await lint("export default function P(){ return <><a href='https://example.com'>x</a><a href='#main'>y</a></>; }", "src/app/x/page.tsx");
    expect(m.length).toBe(0);
  });
  it("ในโฟลเดอร์ components/ui ใช้ของดิบได้ (เป็นที่เดียวที่อนุญาต)", async () => {
    const m = await lint("export default function B(){ return <button>x</button>; }", "src/components/ui/raw.tsx");
    expect(m.length).toBe(0);
  });
});
