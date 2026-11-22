import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi, beforeAll } from "vitest";
import { decryptSecret, encryptSecret, hmacCode } from "@/lib/crypto";
import { altTextOf, appOpenUrl, buildLineMessage, buildTextMessage, cut, LIMITS, safeHref, type Notice } from "@/lib/line/flex";
import { linePush, lineReply, verifyLineSignature } from "@/lib/line/api";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("เข้ารหัสความลับ (AES-256-GCM)", () => {
  it("ถอดได้ค่าเดิม, แต่ละครั้งไม่ซ้ำกัน, รูปแบบ v1, ไม่มีข้อความเดิมปนอยู่", () => {
    const a = encryptSecret("my-channel-secret"), b = encryptSecret("my-channel-secret");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toContain("my-channel-secret");
    expect(decryptSecret(a)).toBe("my-channel-secret");
    expect(decryptSecret(encryptSecret("ไทย 😀 token"))).toBe("ไทย 😀 token");
  });
  it("ข้อมูลถูกแก้/คีย์ผิด/รูปแบบผิด → ถอดไม่ได้ (throw)", () => {
    const enc = encryptSecret("x");
    const parts = enc.split(":");
    expect(() => decryptSecret([parts[0], parts[1], parts[2], Buffer.from("tampered").toString("base64url")].join(":"))).toThrow();
    expect(() => decryptSecret("garbage")).toThrow();
    const old = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(enc)).toThrow();
    process.env.APP_ENCRYPTION_KEY = "short";
    expect(() => encryptSecret("x")).toThrow();
    process.env.APP_ENCRYPTION_KEY = old;
  });
  it("hash รหัสผูก: ผูกกับโรงเรียน, ไม่สนตัวพิมพ์, คงที่", () => {
    expect(hmacCode("s1", "abcd2345")).toBe(hmacCode("s1", "ABCD2345"));
    expect(hmacCode("s1", "ABCD2345")).not.toBe(hmacCode("s2", "ABCD2345"));
    expect(hmacCode("s1", "ABCD2345")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("ลายเซ็น webhook ของ LINE", () => {
  const body = '{"events":[]}';
  const sig = (b: string, s: string) => createHmac("sha256", s).update(b).digest("base64");
  it("ถูกต้อง / body เปลี่ยน / secret อื่น / ไม่มี header / ความยาวต่าง", () => {
    expect(verifyLineSignature(body, sig(body, "sec"), "sec")).toBe(true);
    expect(verifyLineSignature(body + " ", sig(body, "sec"), "sec")).toBe(false);
    expect(verifyLineSignature(body, sig(body, "sec"), "other")).toBe(false);
    expect(verifyLineSignature(body, null, "sec")).toBe(false);
    expect(verifyLineSignature(body, "short", "sec")).toBe(false);
    expect(verifyLineSignature(body, sig(body, "sec"), "")).toBe(false);
  });
});

describe("การ์ด Flex (ตัดความยาวทุกช่อง, altText, ลิงก์ปลอดภัย)", () => {
  const long = "ก".repeat(1000);
  const notice: Notice = { kind: "success", title: long, summary: long, fields: Array.from({ length: 12 }, (_, i) => ({ label: long, value: `${i}${long}` })), link: "/gate", cta: long };
  const msg = buildLineMessage(notice, { appUrl: "https://kidguards.vercel.app", defaultCta: "เปิดแอป" });
  const texts = (n: unknown): string[] => (Array.isArray(n) ? n.flatMap(texts) : n && typeof n === "object" ? Object.entries(n).flatMap(([k, v]) => (k === "text" && typeof v === "string" ? [v] : texts(v))) : []);
  it("ทุกช่องไม่เกินขีดจำกัดของ LINE และแถวไม่เกิน 8", () => {
    const body = msg.contents.body.contents as { type: string; text?: string; contents?: { text: string }[] }[];
    expect(body[0]!.text!.length).toBeLessThanOrEqual(LIMITS.title);
    expect(body[1]!.text!.length).toBeLessThanOrEqual(LIMITS.summary);
    const rows = body.filter((x) => x.type === "box");
    expect(rows.length).toBe(LIMITS.rows);
    for (const r of rows) {
      expect(r.contents![0]!.text.length).toBeLessThanOrEqual(LIMITS.label);
      expect(r.contents![1]!.text.length).toBeLessThanOrEqual(LIMITS.value);
    }
    expect(msg.contents.footer.contents[0]!.action.label.length).toBeLessThanOrEqual(LIMITS.cta);
    expect(msg.altText.length).toBeLessThanOrEqual(LIMITS.altText);
    expect(texts(msg).every((t) => t.length > 0)).toBe(true);
  });
  it("altText มีรายละเอียดในตัว: หัวเรื่อง — สรุป · ป้าย ค่า", () => {
    const a = altTextOf({ kind: "info", title: "ผู้ปกครองรับนักเรียนแล้ว", summary: "น้องภูมิ", fields: [{ label: "ห้อง", value: "ป.2/1" }] });
    expect(a).toBe("ผู้ปกครองรับนักเรียนแล้ว — น้องภูมิ · ห้อง ป.2/1");
  });
  it("สีหัวเรื่องตามชนิด และปุ่มเปิดในเบราว์เซอร์ของเครื่อง", () => {
    const m = buildLineMessage({ kind: "danger", title: "t" }, { appUrl: "https://x.test/", defaultCta: "เปิดแอป" });
    expect((m.contents.body.contents[0] as { color: string }).color).toBe("#B42D2D");
    expect(m.contents.footer.contents[0]!.action.uri).toBe("https://x.test/start?openExternalBrowser=1");
    expect(m.contents.footer.contents[0]!.action.label).toBe("เปิดแอป");
  });
  it("ลิงก์ภายในเท่านั้น: ลิงก์นอก/// / \\ / ว่าง / ยาวเกิน → ตกไป /start", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\x", "", undefined, "/" + "a".repeat(301), "/a\nb"]) expect(safeHref(bad)).toBe("/start");
    expect(safeHref("/admin/students?room=1")).toBe("/admin/students?room=1");
    expect(appOpenUrl("https://x.test", "/a?b=1")).toBe("https://x.test/a?b=1&openExternalBrowser=1");
  });
  it("cut: ตัดด้วย … และไม่เกินความยาว; ข้อความสั้นไม่ถูกแตะ", () => {
    expect(cut("abc", 5)).toBe("abc");
    expect(cut("abcdefghij", 5)).toBe("abcd…");
    expect(cut("a\nb", 10)).toBe("a b");
  });
  it("ข้อความธรรมดา fallback มีข้อมูลชุดเดียวกันและลิงก์", () => {
    const t = buildTextMessage({ kind: "info", title: "หัว", summary: "สรุป", fields: [{ label: "ป้าย", value: "ค่า" }], link: "/home" }, { appUrl: "https://x.test" });
    expect(t.text).toBe("หัว\nสรุป\nป้าย: ค่า\nhttps://x.test/home?openExternalBrowser=1");
  });
});

describe("เรียก LINE API: ตารางข้อผิดพลาดและ header", () => {
  const f = (status: number) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  it("200/409 = ส่งแล้ว; 400 bad_request; 401/403 auth; 429 rate; 5xx server", async () => {
    const kinds = await Promise.all([200, 409, 400, 401, 403, 429, 500, 503].map(async (s) => (await linePush("t", "U1", [], { fetchImpl: f(s) })).kind));
    expect(kinds).toEqual(["ok", "ok", "bad_request", "auth", "auth", "rate", "server", "server"]);
  });
  it("เครือข่ายล่ม → network (ไม่ throw); ส่ง Bearer และ X-Line-Retry-Key", async () => {
    const down = (async () => { throw new TypeError("x"); }) as unknown as typeof fetch;
    expect((await linePush("t", "U1", [], { fetchImpl: down })).kind).toBe("network");
    const spy = f(200);
    await linePush("TOKEN", "U1", [{ type: "text", text: "x" }], { fetchImpl: spy, retryKey: "11111111-2222-4333-8444-555555555555" });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer TOKEN");
    expect(h["X-Line-Retry-Key"]).toBe("11111111-2222-4333-8444-555555555555");
    expect(JSON.parse(init.body as string)).toEqual({ to: "U1", messages: [{ type: "text", text: "x" }] });
  });
  it("reply ตัดข้อความที่ 900 ตัวอักษร", async () => {
    const spy = f(200);
    await lineReply("T", "RT", [{ type: "text", text: "ก".repeat(2000) }], { fetchImpl: spy });
    const body = JSON.parse(((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    expect(body.messages[0].text.length).toBe(900);
  });
});
