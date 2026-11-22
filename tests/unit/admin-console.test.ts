import { describe, expect, it } from "vitest";
import { brandObjectPath, checkFavicon, checkLogo, detectImageMime, parseBrandAssets, parseImageRef, pngSize } from "@/lib/brand/brand";
import { disabledNavHrefs, FEATURE_FLAGS, isEnabled, normalizeFlags, withFlag } from "@/lib/flags/flags";
import { dueEvery, parseRules, ruleEnabled, ruleNumber, sanitizeParams } from "@/lib/rules/rules";
import { describeTick } from "@/lib/rules/describe";
import { buildFunnel, cleanTag, parseAnalytics, parseQueueStats, retentionRate } from "@/lib/analytics/events";
import { filterToQuery, parseFilter, parseSwitch, switchableGroups, bangkokDayStart, bangkokDayEnd } from "@/lib/audit/kinds";
import { auditToCsv } from "@/lib/audit/read";
import { buildLineMessage, buildTextMessage } from "@/lib/line/flex";
import { th } from "@/lib/i18n/dict";

/** PNG ขนาดตามต้องการ (เฉพาะ header พอให้ pngSize อ่านได้) */
function png(w: number, h: number, pad = 0): Uint8Array {
  const b = new Uint8Array(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

describe("รูปแบรนด์", () => {
  it("ตรวจชนิดจากไบต์จริง ไม่เชื่อนามสกุล และไม่รับ SVG/HTML", () => {
    expect(detectImageMime(png(10, 10))).toBe("image/png");
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageMime(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageMime(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageMime(webp)).toBe("image/webp");
  });
  it("pngSize อ่านจาก IHDR", () => {
    expect(pngSize(png(512, 512))).toEqual({ w: 512, h: 512 });
    expect(pngSize(new Uint8Array(40))).toBeNull();
  });
  it("checkFavicon: ต้อง PNG จัตุรัส 192–1024 ≤ 512KB", () => {
    expect(checkFavicon(png(512, 512)).ok).toBe(true);
    expect(checkFavicon(png(192, 192)).ok).toBe(true);
    expect(checkFavicon(png(1024, 1024)).ok).toBe(true);
    expect(checkFavicon(png(512, 256))).toEqual({ ok: false, error: "err_image_square" });
    expect(checkFavicon(png(128, 128))).toEqual({ ok: false, error: "err_image_dims" });
    expect(checkFavicon(png(2048, 2048))).toEqual({ ok: false, error: "err_image_dims" });
    expect(checkFavicon(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toEqual({ ok: false, error: "err_image_type" });
    expect(checkFavicon(png(512, 512, 600_000))).toEqual({ ok: false, error: "err_image_too_big" });
  });
  it("checkLogo: รับ PNG/JPEG/WebP ≤ 1MB เท่านั้น", () => {
    expect(checkLogo(png(40, 40)).ok).toBe(true);
    expect(checkLogo(new TextEncoder().encode("<svg/>"))).toEqual({ ok: false, error: "err_image_type" });
    expect(checkLogo(png(40, 40, 1_100_000))).toEqual({ ok: false, error: "err_image_too_big" });
  });
  it("parseImageRef/parseBrandAssets ใจกว้าง: ข้อมูลเสีย = ไม่มีรูป", () => {
    expect(parseImageRef({ mime: "image/svg+xml", version: 1 })).toBeNull();
    expect(parseImageRef({ mime: "image/png", version: -3 })).toBeNull();
    expect(parseImageRef({ mime: "image/png", version: 5, px: 512 })).toEqual({ mime: "image/png", version: 5, px: 512 });
    expect(parseBrandAssets("x")).toEqual({ logo: null, favicon: null });
  });
  it("path ในที่เก็บมี version (ไม่ทับไฟล์เดิม) และโลโก้โรงเรียนอยู่ใต้ school/<id>/", () => {
    expect(brandObjectPath("logo", { mime: "image/png", version: 7 })).toBe("logo-7.png");
    expect(brandObjectPath("logo", { mime: "image/jpeg", version: 7 }, "abc")).toBe("school/abc/logo-7.jpg");
  });
});

describe("สวิตช์ฟีเจอร์", () => {
  it("ไม่มี key = เปิด; เก็บเฉพาะที่ปิด; ทิ้ง key ที่ไม่รู้จัก", () => {
    expect(isEnabled({}, "voice")).toBe(true);
    expect(isEnabled(undefined, "voice")).toBe(true);
    expect(normalizeFlags({ voice: false, tv_mode: true, bogus: false, zones: "no" })).toEqual({ voice: false });
    expect(normalizeFlags([1, 2])).toEqual({});
    expect(normalizeFlags(null)).toEqual({});
  });
  it("withFlag: เปิด = ลบ key, ปิด = false", () => {
    expect(withFlag({}, "voice", false)).toEqual({ voice: false });
    expect(withFlag({ voice: false }, "voice", true)).toEqual({});
  });
  it("disabledNavHrefs: เทาเมื่อ 'ทุก' flag ปิด", () => {
    const items = [{ href: "/a", flags: ["voice", "tv_mode"] as const }, { href: "/b", flags: ["zones"] as const }, { href: "/c" }];
    expect([...disabledNavHrefs(items, { voice: false })]).toEqual([]);
    expect([...disabledNavHrefs(items, { voice: false, tv_mode: false, zones: false })].sort()).toEqual(["/a", "/b"]);
  });
  it("ทุก flag มีชื่อในพจนานุกรม", () => {
    for (const f of FEATURE_FLAGS) expect((th as Record<string, string>)[`flag_${f}`], f).toBeTruthy();
  });
});

describe("กฎอัตโนมัติ", () => {
  it("ไม่มีแถว = เปิด + ค่าเริ่มต้นในโค้ด; ค่าผิด = ค่าเริ่มต้น", () => {
    const none = parseRules(null);
    expect(ruleEnabled(none, "cleanup_old")).toBe(true);
    expect(ruleNumber(none, "cleanup_old", "notif_days")).toBe(90);
    const r = parseRules([{ key: "cleanup_old", enabled: false, params: { notif_days: 30, msg_days: -5, events_days: "abc", sessions_days: 99999 } }, { nokey: 1 }, null]);
    expect(ruleEnabled(r, "cleanup_old")).toBe(false);
    expect(ruleNumber(r, "cleanup_old", "notif_days")).toBe(30);
    expect(ruleNumber(r, "cleanup_old", "msg_days")).toBe(90);
    expect(ruleNumber(r, "cleanup_old", "events_days")).toBe(730);
    expect(ruleNumber(r, "cleanup_old", "sessions_days")).toBe(365);
  });
  it("sanitizeParams รับเฉพาะชื่อที่กฎมี และจำนวน 0–10,000", () => {
    expect(sanitizeParams("cleanup_old", { notif_days: "45", evil: "1" })).toEqual({ notif_days: 45 });
    expect(sanitizeParams("cleanup_old", { notif_days: "-1" })).toBeNull();
    expect(sanitizeParams("cleanup_old", { notif_days: "99999" })).toBeNull();
    expect(sanitizeParams("cleanup_old", { notif_days: "abc" })).toBeNull();
    expect(sanitizeParams("pickup_expire", { x: 1 })).toEqual({});
  });
  it("dueEvery: ไม่เคยรัน/เวลาเสีย = ถึงรอบ", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(dueEvery(null, 6, now)).toBe(true);
    expect(dueEvery("garbage", 6, now)).toBe(true);
    expect(dueEvery("2026-01-01T07:00:00Z", 6, now)).toBe(false);
    expect(dueEvery("2026-01-01T06:00:00Z", 6, now)).toBe(true);
  });
  it("describeTick อ่านข้อมูลเก่า/เพี้ยนได้", () => {
    expect(describeTick(th, null)).toBe("");
    const line = describeTick(th, { pickup_expire: 2, cleanup_old: -1, stopped: "cleanup_old" });
    expect(line).toContain("2");
    expect(line).toContain(th.rules_off_state);
  });
});

describe("สถิติ", () => {
  it("parseAnalytics/parseQueueStats: ข้อมูลเพี้ยน = 0 ไม่พัง", () => {
    const a = parseAnalytics({ dau: "x", daily: "bad", events: [{ event: 1 }], retention: 5 });
    expect(a.dau).toBe(0);
    expect(a.daily).toEqual([]);
    expect(a.retention.d1).toEqual({ eligible: 0, returned: 0 });
    expect(parseAnalytics(null).wau).toBe(0);
    expect(parseQueueStats(undefined).total).toBe(0);
    expect(parseQueueStats({ wait_avg_s: "x" }).wait_avg_s).toBeNull();
  });
  it("buildFunnel: หารศูนย์ได้ null, ขั้นหลังมากกว่าได้ >100% แต่แท่งไม่เกิน 100", () => {
    const f = buildFunnel([{ step: "a", users: 0 }, { step: "b", users: 5 }, { step: "c", users: 10 }]);
    expect(f[0]!.pct).toBeNull();
    expect(f[1]!.pct).toBeNull(); // ขั้นก่อน = 0
    expect(f[2]!.pct).toBe(200);
    expect(Math.max(...f.map((x) => x.bar))).toBe(100);
  });
  it("retentionRate / cleanTag", () => {
    expect(retentionRate({ eligible: 0, returned: 0 })).toBeNull();
    expect(retentionRate({ eligible: 4, returned: 1 })).toBe(25);
    expect(cleanTag("Hello World!_9")).toBe("helloworld_9");
    expect(cleanTag("")).toBeNull();
    expect(cleanTag("a".repeat(80))).toHaveLength(40);
  });
});

describe("Audit: กลุ่ม ตัวกรอง สวิตช์ CSV", () => {
  it("กลุ่ม audit ปิดไม่ได้ (ไม่อยู่ในรายการติ๊ก) และกลุ่มที่เคยเห็น/ปิดอยู่ไม่หายจากรายการ", () => {
    const g = switchableGroups(["pickup", "newgroup", "BAD GROUP"], ["legacy"]);
    expect(g).not.toContain("audit");
    expect(g).toContain("newgroup");
    expect(g).toContain("legacy");
    expect(g).not.toContain("BAD GROUP");
  });
  it("parseSwitch ใจกว้าง และตัดกลุ่ม audit ออกจาก off_groups", () => {
    expect(parseSwitch(null)).toEqual({ enabled: true, off_groups: [] });
    expect(parseSwitch({ enabled: false, off_groups: ["audit", "pickup", 5, "pickup"] })).toEqual({ enabled: false, off_groups: ["pickup"] });
  });
  it("parseFilter รับเฉพาะรูปแบบที่ถูกต้อง", () => {
    expect(parseFilter({ from: "2026-01-02", to: "bad", group: "pickup", actor: "nope", entity: "x;drop", school: ["8d2d6b3e-0000-4000-8000-000000000000"] })).toEqual({
      from: "2026-01-02", group: "pickup", school: "8d2d6b3e-0000-4000-8000-000000000000",
    });
    expect(filterToQuery({ group: "pickup" }, { before: "9" })).toBe("?group=pickup&before=9");
    expect(filterToQuery({})).toBe("");
  });
  it("ช่วงวันเป็นเวลาไทย", () => {
    expect(bangkokDayStart("2026-03-01")).toBe("2026-02-28T17:00:00.000Z");
    expect(bangkokDayEnd("2026-03-01")).toBe("2026-03-01T17:00:00.000Z");
  });
  it("CSV: escape, กัน formula injection, มี BOM", () => {
    const csv = auditToCsv(
      [{ id: 1, at: "2026-01-01T00:00:00Z", source: "app", actor_id: "u1", actor_role: "school_admin", action: "x.y", entity: "t", entity_id: "=cmd", school_id: null, detail: { a: 'q"uote,' } }],
      new Map([["u1", "สมชาย, ใจดี"]]),
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('"สมชาย, ใจดี"');
    expect(csv).toContain('""uote');
  });
});

describe("การ์ด LINE: ผู้ส่ง", () => {
  const n = { kind: "info" as const, title: "หัวข้อ", summary: "รายละเอียด" };
  it("มีหัวการ์ดชื่อโรงเรียน และ altText ขึ้นต้นด้วยชื่อ", () => {
    const m = buildLineMessage(n, { appUrl: "https://x.test", defaultCta: "เปิด", sender: { name: "ASCS", logoUrl: "https://x.test/brand/school/1?v=2" } });
    expect(m.altText.startsWith("ASCS: ")).toBe(true);
    const header = (m.contents as { header?: { contents: { type: string }[] } }).header;
    expect(header?.contents.map((c) => c.type)).toEqual(["image", "text"]);
  });
  it("โลโก้ที่ไม่ใช่ https ไม่ถูกใส่ (LINE ปฏิเสธทั้งข้อความ)", () => {
    const m = buildLineMessage(n, { appUrl: "https://x.test", defaultCta: "เปิด", sender: { name: "ASCS", logoUrl: "http://x.test/a.png" } });
    expect((m.contents as { header?: { contents: unknown[] } }).header?.contents).toHaveLength(1);
  });
  it("ไม่มี sender = การ์ดเดิม; ข้อความสำรองมีชื่อผู้ส่งบรรทัดแรก", () => {
    const m = buildLineMessage(n, { appUrl: "https://x.test", defaultCta: "เปิด" });
    expect((m.contents as { header?: unknown }).header).toBeUndefined();
    expect(buildTextMessage(n, { appUrl: "https://x.test", sender: { name: "ASCS" } }).text.split("\n")[0]).toBe("ASCS");
  });
});
