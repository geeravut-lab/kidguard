// สร้างคู่มือฉบับสั้น (Quick Guide) ภาษาไทยของ KidGuard เป็น PDF + PNG รายหน้า
//   node scripts/build-guides.mjs
// ใช้ภาพหน้าจอจริงใน docs/guides/shots (ถ่ายด้วย tests/e2e/zz-shots.spec.ts — ข้อมูลสมมุติ) ธีมสี/ฟอนต์เดียวกับแอป
// (Noto Sans Thai Variable + Geist, โทนสี Guard Teal-Blue + Amber)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as L from "lucide-react";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(ROOT, "docs/guides/shots");
const OUT = path.join(ROOT, "docs/guides");
mkdirSync(path.join(OUT, "png"), { recursive: true });

const b64 = (p) => readFileSync(p).toString("base64");
const font = (file, family, range) =>
  `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64(path.join(ROOT, file))}) format('woff2');font-weight:100 900;font-style:normal;${range ? `unicode-range:${range};` : ""}}`;
const FONT_CSS = [
  font("node_modules/@fontsource-variable/noto-sans-thai/files/noto-sans-thai-thai-wght-normal.woff2", "KG Thai", "U+0E01-0E5B,U+200C-200D,U+25CC"),
  font("node_modules/@fontsource-variable/noto-sans-thai/files/noto-sans-thai-latin-wght-normal.woff2", "KG Thai"),
  font("node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2", "KG Geist"),
].join("\n");

const logoSvg = readFileSync(path.join(ROOT, "public/icons/logo.svg"), "utf8").replace(/id="shield"/g, 'id="gshield"').replace(/url\(#shield\)/g, "url(#gshield)").replace(/id="pin"/g, 'id="gpin"').replace(/url\(#pin\)/g, "url(#gpin)");

const icon = (name, size = 22, color = "currentColor", sw = 2) => renderToStaticMarkup(createElement(L[name], { size, color, strokeWidth: sw }));
const md = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

// ---------- ภาพ ----------
const dims = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const imgData = new Map();
const dataUrl = (name) => {
  if (!imgData.has(name)) imgData.set(name, `data:image/png;base64,${b64(path.join(SHOTS, `${name}.png`))}`);
  return imgData.get(name);
};
/** ตัดภาพ (พิกเซลของภาพต้นฉบับ) แล้วแสดงกว้าง W พิกเซล */
const crop = (name, c, W) => {
  const d = dims(path.join(SHOTS, `${name}.png`));
  const x = c.x ?? 0, y = c.y ?? 0, w = c.w ?? d.w - x, h = c.h ?? d.h - y;
  const s = W / w;
  return `<div class="crop" style="width:${W}px;height:${Math.round(h * s)}px"><img alt="" src="${dataUrl(name)}" style="width:${Math.round(d.w * s)}px;margin-left:${-Math.round(x * s)}px;margin-top:${-Math.round(y * s)}px"></div>`;
};
const phone = (name, c, cap, W = 218) => `<figure class="fig"><div class="phone">${crop(name, c, W)}</div><figcaption>${cap}</figcaption></figure>`;
const screen = (name, c, cap, W) => `<figure class="fig"><div class="screen">${crop(name, c, W)}</div><figcaption>${cap}</figcaption></figure>`;
// มือถือ: ตัดส่วนหัว (ชื่อโรงเรียน) ออก y=140 (ภาพ 2x)
const M = (h = 1430, y = 140) => ({ x: 0, y, w: 780, h });
// เดสก์ท็อป: ตัดเมนูซ้ายออก ให้เห็นเนื้อหา
const D = (y, h, x = 470, w = 1450) => ({ x, y, w, h });

// ---------- หน้ากระดาษ ----------
const TOTAL = 11;
let DOC = { total: 11, label: "คู่มือฉบับสั้น" };
const footer = (n) => `<footer><span>โรงเรียน: ______________________________</span><span>KidGuard · ${DOC.label} · ${n}/${DOC.total}</span></footer>`;
const header = ({ ic, title, sub, badge, badge2 }) => `
<header class="band">
  <div class="band-ic">${icon(ic, 34, "#0b6e8a", 2.2)}</div>
  <div class="band-tx"><h1>${title}</h1><p>${sub}</p></div>
  <div class="band-badges"><span class="pill">${badge}</span>${badge2 ? `<span class="pill ghost">${badge2}</span>` : ""}</div>
</header><div class="stripe"></div>`;
const steps = (list) => `<ol class="steps">${list.map((t, i) => `<li><span class="num">${i + 1}</span><span class="st">${md(t)}</span></li>`).join("")}</ol>`;
const note = (t, ic = "Info") => `<div class="note"><span class="note-ic">${icon(ic, 20, "#0b6e8a")}</span><div>${md(t)}</div></div>`;
const page = (n, head, body) => `<section class="page">${head}<div class="body">${body}</div>${footer(n)}</section>`;

const PHONE_BADGE = `${icon("Smartphone", 15, "#0b6e8a")} ใช้บนสมาร์ตโฟน`;
const BIG_BADGE = `${icon("Monitor", 15, "#0b6e8a")} ใช้บนจอใหญ่ (คอมพิวเตอร์/ทีวี)`;
const PC_BADGE = `${icon("Monitor", 15, "#0b6e8a")} แนะนำคอมพิวเตอร์`;

const pages = [];

// ===== 1) ภาพรวม =====
{
  const flow = [
    ["CarFront", "ผู้ปกครอง<br>เริ่มเดินทาง"],
    ["Navigation", "ระบบคำนวณ<br>ระยะและเวลา"],
    ["ListOrdered", "จอคิวโรงเรียน<br>เรียงลำดับสด"],
    ["Backpack", "ครู/เจ้าหน้าที่<br>พานักเรียนมารับ"],
    ["CircleCheckBig", "Check-out<br>ในระบบ"],
  ];
  const stepCards = [
    ["m-home", M(), "เข้าแอป KidGuard", "อนุมัติแล้ว<br>พร้อมแจ้งมารับ"],
    ["m-pickup-start", M(), "เลือกนักเรียน<br>ผู้ขับ และรถ", "กดครั้งเดียว"],
    ["m-travel", M(), "กด “ฉันกำลังไปรับ”", "เห็นเวลาและระยะ"],
    ["m-called", M(), "โรงเรียนยืนยันตัว<br>เรียกนักเรียน", "ได้รับแจ้งทันที"],
    ["m-notifications", M(), "รับนักเรียนแล้ว<br>Check-out", "แจ้งอีกฝ่ายทันที"],
  ];
  const body = `
  <div class="devices">
    <div class="dev">${icon("Smartphone", 30, "#0b6e8a")}<div><b>สมาร์ตโฟน</b><span>ผู้ปกครอง · นักเรียน · อาจารย์ประจำชั้น</span></div></div>
    <div class="dev">${icon("Monitor", 30, "#0b6e8a")}<div><b>จอใหญ่ (คอมพิวเตอร์ / ทีวี)</b><span>คิวส่งนักเรียนที่หน้าประตูโรงเรียน</span></div></div>
  </div>
  <div class="strip">
    ${stepCards
      .map(
        (s, i) => `<div class="sc"><div class="sc-n">${i + 1}</div><div class="sc-t">${s[2]}</div><div class="phone sm">${crop(s[0], s[1], 118)}</div><div class="sc-c">${s[3]}</div></div>${i < 4 ? `<div class="arr">${icon("ChevronRight", 22, "#0b6e8a", 3)}</div>` : ""}`,
      )
      .join("")}
  </div>
  <div class="panel"><div class="panel-h">การทำงานของระบบ</div>
    <div class="flow">${flow.map((f, i) => `<div class="fl"><div class="fl-ic">${icon(f[0], 30, "#0b6e8a")}</div><div class="fl-t">${f[1]}</div></div>${i < 4 ? `<div class="arr">${icon("MoveRight", 22, "#0b6e8a", 2.5)}</div>` : ""}`).join("")}</div>
  </div>
  <div class="panel"><div class="panel-h">การแจ้งเตือน (ในแอป และ LINE ถ้าผูกไว้)</div>
    <div class="cols3">
      <div class="col"><div class="col-h">${icon("Bell", 17, "#0b6e8a")} ผู้ปกครอง</div>
        <div class="msg"><b>อนุมัติแล้ว</b>โรงเรียนอนุมัติให้ผูกนักเรียนกับบัญชีคุณแล้ว</div>
        <div class="msg"><b>นักเรียนกำลังมาที่รถ</b>เจ้าหน้าที่เรียกนักเรียนแล้ว</div>
        <div class="msg ok"><b>โรงเรียนส่งนักเรียนแล้ว</b>Check-out เรียบร้อย พร้อมเวลา</div></div>
      <div class="col"><div class="col-h">${icon("School", 17, "#0b6e8a")} โรงเรียน / ครู</div>
        <div class="msg"><b>ผู้ปกครองกำลังมา</b>เห็นบนจอคิว เรียงตามเวลาที่จะถึง (สด)</div>
        <div class="msg"><b>ผู้ปกครองรับนักเรียนแล้ว</b>ผู้ปกครองกด Check-out ก่อน ครู/เจ้าหน้าที่ได้รับแจ้ง</div>
        <div class="msg warn"><b>มีนักเรียนที่ยังไม่ได้รับ</b>เตือนรับช้าหลังเลิกเรียน</div></div>
      <div class="col"><div class="col-h">${icon("Backpack", 17, "#0b6e8a")} นักเรียน (ถ้าโรงเรียนเปิดใช้)</div>
        <div class="msg"><b>ผู้ปกครองใกล้ถึงแล้ว</b>จะถึงโรงเรียนในอีกประมาณ N นาที เตรียมตัวได้</div>
        <div class="msg"><b>เห็นเฉพาะระยะและเวลา</b>ไม่เห็นตำแหน่ง เส้นทาง หรือทะเบียน</div></div>
    </div>
  </div>
  <div class="notes">
    <div>${icon("MapPin", 18, "#0b6e8a")}<span>แจ้งมารับได้เมื่ออยู่ห่างโรงเรียน<b>ไม่เกินระยะที่โรงเรียนกำหนด</b> (ปกติ 2 กม.)</span></div>
    <div>${icon("ShieldCheck", 18, "#0b6e8a")}<span>ใช้ตำแหน่ง<b>เฉพาะระหว่างแจ้งมารับ</b> ไม่เก็บเส้นทาง โรงเรียนเห็นแค่ระยะและเวลา</span></div>
    <div>${icon("Wifi", 18, "#0b6e8a")}<span>เปิด <b>GPS และอินเทอร์เน็ต</b> และ<b>เปิดหน้าจอ KidGuard ค้างไว้</b>ระหว่างเดินทาง</span></div>
  </div>`;
  pages.push(page(1, header({ ic: "Route", title: "Flow ขั้นตอนการรับนักเรียนกลับบ้าน", sub: "ระบบแจ้งเตือนและติดตามการรับนักเรียน ผ่านเว็บแอป KidGuard", badge: "ภาพรวม" }), body));
}

// ===== 2) ผู้ปกครอง ① =====
pages.push(
  page(
    2,
    header({ ic: "UserRound", title: "ผู้ปกครอง ① เริ่มต้นใช้งาน", sub: "สมัครและลงทะเบียนบุตรหลานครั้งแรก (ทำครั้งเดียว)", badge: PHONE_BADGE }),
    `<div class="shots">${phone("m-login", M(), "เข้าสู่ระบบ / สมัครใช้งาน")}${phone("m-onboarding-1", M(), "ลงทะเบียน 4 ขั้นตอน")}${phone("m-home", M(), "อนุมัติแล้ว พร้อมแจ้งมารับ")}</div>` +
      steps([
        "เปิดลิงก์ KidGuard ของโรงเรียนบนมือถือ กด **สมัครใช้งาน** ด้วยอีเมล หรือเข้าสู่ระบบด้วย **Google / LINE**",
        "กรอก **4 ขั้นตอน**: ผู้ปกครองและรถ (ชื่อ เบอร์โทร ทะเบียน) → นักเรียน (เลือกโรงเรียน เลือกห้อง **พิมพ์ชื่อ-นามสกุลนักเรียน**) → ครูประจำชั้น → ยืนยัน",
        "ติ๊ก **ยอมรับ** นโยบายความเป็นส่วนตัวและการใช้ตำแหน่ง แล้วส่งคำขอ",
        "รอ **โรงเรียนหรือครูประจำชั้นอนุมัติ** (ได้รับแจ้งในแอป/LINE) — อนุมัติแล้วจึงแจ้งมารับได้",
        "เพิ่มผู้ปกครองอีกคน หรือรถอีกคัน ภายหลังได้ที่เมนู **บัญชีของฉัน**",
      ]) +
      note("เพื่อความปลอดภัย ระบบ**ไม่แสดงรายชื่อนักเรียน**ให้เลือก — ต้องพิมพ์ชื่อเอง และการเปลี่ยนเบอร์โทร/ทะเบียนรถถูกบันทึกไว้ตรวจสอบ", "ShieldCheck"),
  ),
);

// ===== 3) ผู้ปกครอง ② =====
pages.push(
  page(
    3,
    header({ ic: "CarFront", title: "ผู้ปกครอง ② แจ้งมารับนักเรียน", sub: "กดครั้งเดียวเมื่อใกล้ถึง โรงเรียนจะเตรียมนักเรียนให้ทันเวลา", badge: PHONE_BADGE }),
    `<div class="shots">${phone("m-pickup-start", M(), "เลือกนักเรียน ผู้ขับ และรถ")}${phone("m-travel", M(), "ดูเวลาและระยะ บนแผนที่ของคุณ")}${phone("m-called", M(), "เจ้าหน้าที่ยืนยันตัวและเรียกแล้ว")}</div>` +
      steps([
        "เมื่ออยู่ในระยะที่โรงเรียนกำหนด (ปกติไม่เกิน 2 กม.) เปิดเมนู **รับนักเรียน**",
        "เลือก **นักเรียนที่มารับ** ผู้ขับ และรถ แล้วกด **ฉันกำลังไปรับ** (อนุญาตให้ใช้ตำแหน่ง)",
        "ดู **เวลาและระยะ**ที่จะถึง บนแผนที่ที่คุณเห็นคนเดียว — **เปิดหน้าจอนี้ค้างไว้** ระหว่างขับ",
        "ถึงแล้ว เจ้าหน้าที่ **ยืนยันตัว** และ **เรียกนักเรียน** คุณจะได้รับแจ้ง (ถ้า GPS ไม่ทำงาน กด **ฉันถึงประตูแล้ว**)",
        "รับนักเรียนแล้วกด **รับนักเรียนแล้ว** หรือรอโรงเรียนกด “ส่งนักเรียนแล้ว” — ฝั่งไหนกดก่อน อีกฝั่งได้รับแจ้งทันที · เปลี่ยนใจกด **ยกเลิกการแจ้ง**",
      ]) +
      note("ระบบ**ไม่เก็บเส้นทาง** โรงเรียนเห็นเพียงระยะและเวลา · ถ้าไม่มีการอัปเดตตำแหน่งนาน การแจ้งจะหมดอายุเอง (ตามเวลาที่โรงเรียนตั้ง) · เว็บแอปติดตามตอนปิดหน้าจอไม่ได้ ให้เปิดค้างไว้", "Info"),
  ),
);

// ===== 4) ผู้ปกครอง ③ =====
pages.push(
  page(
    4,
    header({ ic: "QrCode", title: "ผู้ปกครอง ③ ผู้รับแทน และแจ้งล่วงหน้า", sub: "ให้ญาติหรือคนขับรถมารับแทนอย่างปลอดภัย และบอกโรงเรียนล่วงหน้า", badge: PHONE_BADGE }),
    `<div class="shots">${phone("m-passes-form", M(), "สร้างรหัสผู้รับแทน")}${phone("m-passes-code", M(), "รหัส 8 ตัวและ QR (แสดงครั้งเดียว)")}${phone("m-plan", M(), "แจ้งล่วงหน้าที่หน้าบุตรหลาน")}</div>` +
      steps([
        "เมนู **ผู้รับแทน** → ใส่ชื่อผู้รับ (และทะเบียนรถ) เลือกนักเรียน เลือกวันใช้ได้ (วันนี้ หรือสูงสุด 7 วัน) → **สร้างรหัส**",
        "ส่ง **รหัส 8 ตัวหรือ QR** ให้ผู้รับแทนเอง — **แสดงครั้งเดียว** ถ้าหายให้ยกเลิกแล้วสร้างใหม่ (มีรหัสที่ใช้ได้พร้อมกันไม่เกิน 5 รหัส)",
        "ที่ประตู ผู้รับแทนแสดงรหัส เจ้าหน้าที่ **ตรวจชื่อและบัตรประจำตัว** แล้วยืนยัน — ใช้ได้ **ครั้งเดียว** และคุณได้รับแจ้งทันที",
        "**แจ้งล่วงหน้า**: เลือกวัน (วันนี้ถึง 14 วัน) และวิธีกลับ — รับเอง / รถโรงเรียน / ลา / คนอื่นรับ",
        "ถ้าลูกยังรอรับหลังเลิกเรียนเกินเวลาที่โรงเรียนตั้ง ระบบจะ **เตือนรับช้า** (เฉพาะเด็กที่แจ้งว่ามีคนมารับ)",
      ]) +
      note("ผู้รับแทน**ไม่ต้องมีบัญชี** · รหัสไม่ใช่การยืนยันตัวตน ด่านสุดท้ายคือเจ้าหน้าที่ที่ประตูตรวจบัตร · ถ้าโรงเรียนติดธงนักเรียน ระบบจะแจ้งให้ติดต่อโรงเรียน", "ShieldCheck"),
  ),
);

// ===== 5) แจ้งเตือน + LINE + ติดตั้ง =====
pages.push(
  page(
    5,
    header({ ic: "Bell", title: "ผู้ปกครอง ④ แจ้งเตือน LINE และติดตั้งแอป", sub: "รับแจ้งเตือนแม้ไม่ได้เปิดแอป และเก็บแอปไว้บนหน้าจอโฮม", badge: PHONE_BADGE }),
    `<div class="shots">${phone("m-notifications", M(), "กระดิ่งแจ้งเตือนในแอป")}${phone("m-line-1", M(), "บัญชีของฉัน → เชื่อมต่อ LINE")}${phone("m-line-3", M(), "รหัสผูก LINE และขั้นตอน")}</div>` +
      steps([
        "เมนู **บัญชีของฉัน** → การ์ด **แจ้งเตือนทาง LINE** → กด **เชื่อมต่อ LINE**",
        "กด **เพิ่ม LINE Official Account** ของโรงเรียน (เพิ่มเพื่อน)",
        "กด **เปิดแชตพร้อมรหัส** แล้วกดส่ง (หรือคัดลอกรหัส 8 ตัวไปวางในแชต) — รหัสใช้ได้ครั้งเดียว หมดอายุใน 30 นาที",
        "LINE ตอบกลับว่าเชื่อมต่อเรียบร้อย — หน้าจอเปลี่ยนเป็น “เชื่อมต่อแล้ว” และการ์ดแจ้งเตือนจะมาที่ LINE",
        "**ติดตั้งแอป**: iPhone (Safari) กดปุ่มแชร์ → “เพิ่มลงในหน้าจอโฮม” · Android (Chrome) เมนู ⋮ → “ติดตั้งแอป” หรือกดปุ่ม “ติดตั้งเป็นแอปบนเครื่อง” ในเมนู",
      ]) +
      note("การแจ้งเตือน**ในแอป (ไอคอนกระดิ่ง)** ใช้ได้เสมอ — LINE เป็นช่องทางเสริม · ยกเลิกการเชื่อมต่อ LINE ได้ที่เดิมทุกเมื่อ", "Bell"),
  ),
);

// ===== 6) อาจารย์ประจำชั้น =====
pages.push(
  page(
    6,
    header({ ic: "GraduationCap", title: "อาจารย์ประจำชั้น", sub: "ดูผู้ปกครองที่กำลังมารับนักเรียนห้องคุณ และอนุมัติคำขอของห้อง", badge: PHONE_BADGE }),
    `<div class="shots">${phone("m-teacher", M(), "คิวผู้ปกครองของห้องคุณ (สด)")}${phone("m-teacher-claims", M(), "คำขอผูกนักเรียนของห้อง")}${phone("m-teacher-roster", M(), "รายชื่อนักเรียนในห้อง")}</div>` +
      steps([
        "เข้าสู่ระบบด้วยลิงก์เชิญจากผู้ดูแลโรงเรียน (ครั้งแรก) แล้วเปิดเมนู **ห้องของฉัน**",
        "ดู **คิวผู้ปกครองที่กำลังมา** เฉพาะนักเรียนห้องคุณ เรียงจากใกล้ถึงที่สุด อัปเดตเองไม่ต้องรีเฟรช",
        "พานักเรียนไปรอที่จุดรับ เมื่อผู้ปกครองถึงกด **เรียกนักเรียน** (เฉพาะเด็กห้องคุณ)",
        "ส่งนักเรียนขึ้นรถแล้วกด **ส่งนักเรียนแล้ว** — ผู้ปกครองได้รับแจ้ง (ถ้าผู้ปกครองกดรับก่อน คุณก็ได้รับแจ้ง)",
        "**คำขอผูกนักเรียน**: ตรวจว่าเป็นผู้ปกครองจริง เลือกนักเรียนที่ตรงกัน แล้วกด **อนุมัติ** หรือ **ไม่อนุมัติ**",
        "ดู **แผนการกลับวันนี้** (รถโรงเรียน / ลา / รับเอง) ที่ผู้ปกครองแจ้งล่วงหน้า",
      ]) +
      note("ครูเห็น**เฉพาะนักเรียนห้องตัวเอง** (บังคับที่ฐานข้อมูล) · เด็กที่ติดธงห้ามปล่อยจะมีป้ายแดงและปล่อยไม่ได้ — ให้ติดต่อผู้ดูแลโรงเรียน", "ShieldCheck"),
  ),
);

// ===== 7) นักเรียน =====
pages.push(
  page(
    7,
    header({ ic: "Backpack", title: "นักเรียน (ถ้าโรงเรียนเปิดใช้)", sub: "ดูว่าผู้ปกครองจะถึงอีกกี่นาที เพื่อเตรียมตัวขึ้นรถ", badge: PHONE_BADGE }),
    `<div class="shots two">${phone("m-student-link", M(), "ผู้ปกครอง: สร้างลิงก์ให้นักเรียน", 262)}${phone("m-student", M(), "นักเรียน: เห็นเวลาที่ผู้ปกครองจะถึง", 262)}</div>` +
      steps([
        "ผู้ปกครอง (หน้า **บุตรหลานของฉัน**) หรือผู้ดูแลโรงเรียน กด **สร้างลิงก์ให้นักเรียนใช้** — ลิงก์ใช้ได้ครั้งเดียว",
        "นักเรียนเปิดลิงก์บนมือถือของตัวเอง แล้วเข้าสู่ระบบ (สมัครบัญชีใหม่ได้) — บัญชีจะผูกกับนักเรียนคนนั้น",
        "หน้า **ผู้ปกครองมารับ** แสดง “จะถึงโรงเรียนในอีกประมาณ N นาที”",
        "ได้รับแจ้งเมื่อผู้ปกครองใกล้ถึง (ตามจำนวนนาทีที่โรงเรียนตั้ง) — เตรียมตัวไปรอที่จุดรับได้เลย",
      ]) +
      note("นักเรียนเห็น**เฉพาะระยะและเวลา** — ไม่เห็นตำแหน่ง เส้นทาง ทะเบียน หรือชื่อผู้ปกครอง · ฟีเจอร์นี้โรงเรียนเลือกเปิดเอง (ปิดไว้เป็นค่าเริ่มต้น) เหมาะกับนักเรียนโต", "ShieldCheck"),
  ),
);

// ===== 8) คิวส่งโรงเรียน (จอใหญ่) =====
pages.push(
  page(
    8,
    header({ ic: "ListOrdered", title: "คิวส่งนักเรียน (หน้าประตูโรงเรียน)", sub: "ติดตามผู้ปกครองที่กำลังมา เรียกนักเรียน และส่งมอบ", badge: BIG_BADGE }),
    `<div class="wide">${screen("d-gate", D(40, 830), "จอประตู: คิวเรียงจากใกล้ถึงที่สุด อัปเดตเองแบบสด", 694)}</div>
     <div class="shots two small">${screen("d-gate-pass", D(540, 660), "ตรวจรหัสผู้รับแทน", 340)}${screen("d-tv", { x: 0, y: 0, w: 1920, h: 1080 }, "จอ TV: ชื่อเล่นที่ถูกเรียก (ผู้ปกครองเห็นได้)", 340)}</div>` +
      steps([
        "เปิด **จอประตู** บนคอมพิวเตอร์/ทีวีที่หน้าประตู (เข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่) — คิวเรียงจาก **ใกล้ถึงที่สุด** และอัปเดตเอง",
        "แต่ละแถวบอก ผู้ขับ ทะเบียน รถ เวลาที่จะถึง ระยะ และนักเรียน (พี่น้องคนละห้อง = แถวเดียว)",
        "รถมาถึง ตรวจทะเบียน/ชื่อ กด **ยืนยันตัวที่ประตู** → **เรียกนักเรียน** → นักเรียนขึ้นรถ กด **ส่งนักเรียนแล้ว**",
        "ผู้รับแทน: ใส่ **รหัสผู้รับแทน** (หรือสแกน QR) → ตรวจบัตรประจำตัว → ยืนยัน (ใช้ได้ครั้งเดียว)",
        "หลายประตู: กรอง/ย้ายประตูได้ · กด **เปิดเสียงเรียก** ให้เครื่องพูดชื่อนักเรียน (แตะหนึ่งครั้ง)",
      ]) +
      note("เด็กที่ติดธง**ห้ามปล่อย**จะมีป้ายแดงและปุ่มส่งถูกปิด · ช่วง**พักการรับ** ปุ่มเรียก/ส่งถูกปิดทั้งหมดจนกว่าผู้ดูแลจะเปิดรับอีกครั้ง", "OctagonAlert"),
  ),
);

// ===== 9) ผู้ดูแล ① ตั้งค่าโรงเรียน =====
const AD = (y, h) => ({ x: 590, y, w: 1180, h });
pages.push(
  page(
    9,
    header({ ic: "Settings", title: "ผู้ดูแลโรงเรียน ① ตั้งค่าโรงเรียน", sub: "ตั้งค่าครั้งแรกให้ระบบพร้อมใช้งาน (เมนู “ตั้งค่า”)", badge: PC_BADGE }),
    `<div class="shots col">${screen("d-admin-settings", AD(225, 490), "ข้อมูลโรงเรียนและตำแหน่งที่ตั้ง", 694)}${screen("d-admin-settings", AD(745, 500), "ระยะ check-in การแจ้งเตือน และเวลา", 694)}</div>` +
      steps([
        "รับลิงก์เชิญจากผู้ดูแลแพลตฟอร์ม → สร้างบัญชี → เข้าเมนูผู้ดูแลโรงเรียน",
        "ตั้ง **ชื่อโรงเรียน** และ **ตำแหน่งที่ตั้ง** (กด “ใช้ตำแหน่งปัจจุบันของฉัน” ขณะอยู่ที่ประตู) — **ต้องตั้งตำแหน่งก่อน** ผู้ปกครองจึงจะแจ้งมารับได้",
        "ปรับ **ระยะที่ check-in ได้** (ปกติ 2,000 ม.) ระยะ “ถึงประตูแล้ว” เวลาแจ้งนักเรียน อายุของการแจ้ง และช่วงเวลาที่เปิดให้ check-in",
        "ท้ายหน้ามี **เวลาเลิกเรียน** (ใช้เตือนรับช้า) **เสียงเรียก** และ **จอ TV** · ตั้ง **ชื่อและโลโก้** โรงเรียนได้ที่เมนู “ชื่อและโลโก้”",
      ]) +
      note("ค่าต่าง ๆ ปรับได้เองโดยไม่ต้องแก้ระบบ และการเปลี่ยนค่าถูกบันทึกใน Audit", "KeyRound"),
  ).replace('class="body"', 'class="body compact"'),
);

// ===== 10) ผู้ดูแล ② ห้องเรียน เจ้าหน้าที่ อนุมัติ =====
pages.push(
  page(
    10,
    header({ ic: "Users", title: "ผู้ดูแลโรงเรียน ② ห้องเรียน ครู และการอนุมัติ", sub: "สร้างห้อง นำเข้านักเรียน เชิญเจ้าหน้าที่ และอนุมัติผู้ปกครอง", badge: PC_BADGE }),
    `<div class="shots col">${screen("d-admin-classrooms", AD(40, 470), "ห้องเรียนและครูประจำชั้น", 694)}${screen("d-admin-approvals", AD(90, 500), "คำขอผูกนักเรียน: ตรวจแล้วกดอนุมัติ", 694)}</div>` +
      steps([
        "สร้าง **ห้องเรียน** แล้วนำเข้ารายชื่อ **นักเรียน** (ไฟล์ CSV) หรือเพิ่มทีละคน",
        "เมนู **เจ้าหน้าที่**: สร้างลิงก์เชิญ **ครูประจำชั้น** (ผูกห้อง) / **เจ้าหน้าที่ประตู** / ผู้ดูแล — ลิงก์ใช้ได้ครั้งเดียว มีอายุจำกัด",
        "**คำขอผูกนักเรียน**: ตรวจว่าเป็นผู้ปกครองจริง เลือกนักเรียนที่ตรงกัน แล้วกด **อนุมัติ** (ครูประจำชั้นอนุมัติแทนได้)",
        "เมนู **LINE**: ใส่ Basic ID, Channel secret, Access token ของ LINE OA โรงเรียน แล้วนำ Webhook URL ไปตั้งที่ LINE Developers (ปิด Auto-reply)",
      ]) +
      note("ความลับของ LINE ถูกเข้ารหัสและไม่แสดงกลับ · ผู้ปกครองแจ้งมารับได้เมื่อได้รับ**อนุมัติ**แล้วเท่านั้น", "KeyRound"),
  ).replace('class="body"', 'class="body compact"'),
);

// ===== 11) ผู้ดูแล ③ ความปลอดภัย =====
pages.push(
  page(
    11,
    header({ ic: "ShieldAlert", title: "ผู้ดูแลโรงเรียน ③ ความปลอดภัย", sub: "ธงห้ามปล่อย ประกาศฉุกเฉิน ประตู จอ TV และบันทึกการใช้งาน", badge: PC_BADGE }),
    `<div class="shots two big">${screen("n-custody", { x: 440, y: 40, w: 780, h: 1150 }, "ธงห้ามปล่อย: เลือกนักเรียน ชนิดธง และเหตุผล", 340)}${screen("n-announce", { x: 440, y: 40, w: 780, h: 1150 }, "ประกาศ / พักการรับ", 340)}</div>` +
      steps([
        "**ธงห้ามปล่อย**: เลือกนักเรียน → ชนิดธง (ห้ามปล่อยให้ใคร / ห้ามบัญชีผู้ปกครองนี้) → บันทึกเหตุผล (เห็นเฉพาะผู้ดูแล) → **ติดธง**",
        "**ประกาศ/พักการรับ**: ส่งข้อความถึงทุกคนทันที ติ๊ก **พักการรับ** เพื่อหยุดการแจ้งมารับและการปล่อยนักเรียน จนกว่ากด **เปิดรับอีกครั้ง**",
        "**ประตู/โซน** กำหนดประตูของแต่ละห้อง · **จอ TV** ได้ลิงก์ลับ (แสดงครั้งเดียว) เปิดบนทีวีโดยไม่ต้องล็อกอิน แสดงเฉพาะชื่อเล่นและห้อง",
        "**บันทึกการใช้งาน (Audit)** ดู กรอง ส่งออก CSV และเลือกชนิดที่จะเก็บ · **สถิติ** ดูผู้ใช้งานและเวลารอที่ประตู",
      ]) +
      note("ประกาศส่งทันทีและ**เรียกคืนไม่ได้** — ตรวจข้อความก่อนกดส่ง · การเปลี่ยนสวิตช์/ส่งออก/ลบใน Audit ถูกบันทึกเสมอ", "OctagonAlert"),
  ).replace('class="body"', 'class="body compact"'),
);

// ---------- CSS ----------
const CSS = `
${FONT_CSS}
@page { size: A4; margin: 0; }
:root{--p:#0b6e8a;--ps:#0b5c8a;--pl:#27b3c4;--bg:#f5fafb;--s2:#eaf4f7;--ink:#12303b;--soft:#4a6572;--line:#d5e5ea;--ok:#1f7a52;--okbg:#e3f5ec;--warn:#8a5a00;--warnbg:#fff2d6;--acc:#ffc247}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;font-family:'KG Thai','KG Geist',system-ui,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:794px;height:1123px;position:relative;overflow:hidden;page-break-after:always;background:#fff;display:flex;flex-direction:column}
.band{display:flex;align-items:center;gap:16px;padding:26px 36px 22px;color:#fff;background:linear-gradient(120deg,var(--ps) 0%,var(--p) 55%,var(--pl) 130%)}
.band-ic{flex:none;width:62px;height:62px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.18)}
.band-tx{flex:1;min-width:0}
.band-tx h1{font-size:25px;font-weight:800;line-height:1.25;letter-spacing:-.2px}
.band-tx p{font-size:14.5px;opacity:.94;margin-top:4px}
.band-badges{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.pill{display:inline-flex;align-items:center;gap:6px;background:#fff;color:var(--p);font-weight:700;font-size:12.5px;padding:6px 12px;border-radius:99px;white-space:nowrap}
.stripe{height:8px;background:var(--acc)}
.body{flex:1;padding:20px 36px 0;display:flex;flex-direction:column;gap:18px;min-height:0}
.shots{display:flex;justify-content:center;gap:16px;align-items:flex-start}
.shots.two{gap:28px}
.shots.col{flex-direction:column;align-items:center;gap:14px}
.compact .st{font-size:14.4px;line-height:1.45}.compact .steps{gap:9px}.compact .note{font-size:12.9px}
.shots.small{gap:14px}
.fig{display:flex;flex-direction:column;align-items:center;gap:7px}
figcaption{font-size:12.5px;color:var(--soft);text-align:center;font-weight:600;max-width:340px;line-height:1.35}
.phone{border:3px solid var(--ink);border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 6px 18px rgba(11,110,138,.18);padding:0}
.phone.sm{border-width:2px;border-radius:14px;box-shadow:0 3px 8px rgba(11,110,138,.15)}
.screen{border:2px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 6px 18px rgba(11,110,138,.15)}
.crop{overflow:hidden;position:relative;background:#fff}
.crop img{display:block;max-width:none}
.wide{display:flex;justify-content:center}
.steps{list-style:none;display:flex;flex-direction:column;gap:12px}
.steps li{display:flex;gap:11px;align-items:flex-start}
.num{flex:none;width:25px;height:25px;border-radius:50%;background:var(--p);color:#fff;font-weight:800;font-size:13.5px;display:flex;align-items:center;justify-content:center;margin-top:1px;font-family:'KG Geist','KG Thai'}
.st{font-size:15.2px;line-height:1.5}
.st b{color:var(--ps);font-weight:800}
.note{display:flex;gap:10px;align-items:flex-start;background:var(--s2);border:1px solid var(--line);border-left:4px solid var(--p);border-radius:10px;padding:11px 14px;font-size:13.6px;line-height:1.5;color:var(--ink)}
.note b{color:var(--ps)}
.note-ic{flex:none;margin-top:1px}
footer{display:flex;justify-content:space-between;padding:12px 36px 18px;font-size:11.5px;color:var(--soft)}
/* หน้าภาพรวม */
.devices{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dev{display:flex;gap:12px;align-items:center;background:var(--s2);border:1px solid var(--line);border-radius:14px;padding:10px 14px}
.dev b{display:block;font-size:14.5px}.dev span{font-size:12px;color:var(--soft)}
.strip{display:flex;align-items:center;justify-content:space-between;gap:2px}
.sc{display:flex;flex-direction:column;align-items:center;gap:5px;width:124px}
.sc-n{width:26px;height:26px;border-radius:50%;background:var(--p);color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;font-family:'KG Geist'}
.sc-t{font-size:11.8px;font-weight:700;text-align:center;line-height:1.3;min-height:31px}
.sc-c{font-size:11px;color:var(--soft);text-align:center;font-weight:600;line-height:1.3}
.arr{display:flex;align-items:center;margin-top:60px}
.panel{border:1.5px solid var(--line);border-radius:14px;padding:12px 14px 12px;position:relative;background:#fbfdfe}
.panel-h{display:inline-block;background:var(--p);color:#fff;font-weight:800;font-size:13px;padding:3px 12px;border-radius:99px;margin-bottom:10px}
.flow{display:flex;align-items:flex-start;justify-content:space-between}
.fl{display:flex;flex-direction:column;align-items:center;gap:6px;width:118px}
.fl-ic{width:54px;height:54px;border-radius:50%;background:var(--s2);display:flex;align-items:center;justify-content:center}
.fl-t{font-size:12px;font-weight:700;text-align:center;line-height:1.3}
.flow .arr{margin-top:16px}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.col-h{display:flex;gap:6px;align-items:center;font-weight:800;font-size:13px;color:var(--ps);margin-bottom:6px}
.msg{background:#fff;border:1px solid var(--line);border-radius:9px;padding:6px 9px;font-size:11px;line-height:1.4;color:var(--soft);margin-bottom:5px;border-left:3px solid var(--p)}
.msg b{display:block;color:var(--ink);font-size:11.8px}
.msg.ok{border-left-color:var(--ok)}.msg.warn{border-left-color:var(--acc)}
.notes{display:flex;flex-direction:column;gap:6px;background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:10px 14px;font-size:12.3px}
.notes div{display:flex;gap:9px;align-items:center}.notes b{color:var(--ps)}
`;

const wrapHtml = (title, list) => `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${list.join("")}</body></html>`;

// ===== เอกสารที่ 2: คู่มือฝึกอบรมครู/เจ้าหน้าที่ (เฟส 7) =====
DOC = { total: 4, label: "คู่มือฝึกอบรมครูและเจ้าหน้าที่" };
const trainPages = [];
const table = (head, rows) => `<table class="tb"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${md(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
trainPages.push(
  page(1, header({ ic: "Presentation", title: "แผนการอบรมครูและเจ้าหน้าที่ (60 นาที)", sub: "ก่อนเริ่มนำร่อง 1–2 ห้อง · ผู้เข้าอบรม: ครูประจำชั้น เจ้าหน้าที่ประตู ผู้ดูแลโรงเรียน", badge: "ฝึกอบรม" }),
    `<div class="devices"><div class="dev">${icon("Users", 28, "#0b6e8a")}<div><b>ผู้เข้าอบรม</b><span>ครูประจำชั้นห้องนำร่อง · เจ้าหน้าที่ประตู · ผู้ดูแลโรงเรียน (รอบละไม่เกิน 15 คน)</span></div></div>
     <div class="dev">${icon("ClipboardCheck", 28, "#0b6e8a")}<div><b>เตรียมก่อนอบรม</b><span>มือถือคนละเครื่อง · จอใหญ่ที่ประตู · บัญชีฝึก (ผู้ดูแลสร้างลิงก์เชิญไว้แล้ว)</span></div></div></div>` +
    table(["เวลา", "หัวข้อ", "ทำอะไร", "ผู้สอน"], [
      ["0–10 น.", "ภาพรวมและเหตุผล", "ดูหน้า “Flow ขั้นตอนการรับนักเรียน” อธิบายว่าระบบช่วยจัดคิว **ไม่ใช่การยืนยันตัวตน** ด่านสุดท้ายคือคนที่ประตู", "ผู้ดูแล"],
      ["10–25 น.", "ครูประจำชั้น (มือถือ)", "เข้าสู่ระบบ → ห้องของฉัน → ดูคิวของห้อง → **เรียกนักเรียน / ส่งนักเรียนแล้ว** → อนุมัติคำขอผูกนักเรียน", "ผู้ดูแล"],
      ["25–45 น.", "เจ้าหน้าที่ประตู (จอใหญ่)", "จอประตู → ยืนยันตัว → เรียก → ส่ง · **ตรวจรหัสผู้รับแทน** · ป้าย **ห้ามปล่อย** · ช่วง **พักการรับ** · เปิดเสียงเรียก", "ผู้ดูแล"],
      ["45–55 น.", "ฝึกสถานการณ์ (หน้า 2)", "แบ่งกลุ่มเล่นบทบาท ผู้ปกครอง / ครู / เจ้าหน้าที่ประตู ด้วยบัญชีฝึก", "ทุกคน"],
      ["55–60 น.", "ถามตอบและแจกคู่มือ", "แจกคู่มือฉบับสั้นและหน้า “แก้ปัญหาที่ประตู” (หน้า 3) ติดไว้ที่ประตู", "ผู้ดูแล"],
    ]) +
    `<div class="note"><span class="note-ic">${icon("Target", 20, "#0b6e8a")}</span><div><b>เป้าหมายหลังอบรม:</b> ทุกคนทำได้เองโดยไม่ต้องถาม — (1) เรียก/ส่งนักเรียนถูกคน (2) ตรวจรหัสผู้รับแทนและบัตรประจำตัว (3) รู้ว่าเห็น **ห้ามปล่อย** หรือ **พักการรับ** แล้วต้องหยุดและติดต่อผู้ดูแล (4) บอกผู้ปกครองได้ว่าต้องเปิดหน้าจอค้างไว้และเปิด GPS</div></div>
     <div class="panel"><div class="panel-h">หลักที่ต้องย้ำทุกรอบ</div><ul class="bul">
       <li>ระบบบอก **ใกล้ถึงเมื่อไร** ไม่ได้บอกว่า **ใครคือผู้รับ** — ตรวจชื่อ/ทะเบียน/บัตรทุกครั้ง</li>
       <li>เห็นป้าย **ห้ามปล่อย** → ไม่ส่งนักเรียน ไม่ต้องถามเหตุผล แจ้งผู้ดูแลโรงเรียนทันที</li>
       <li>ผู้ปกครองกด “รับนักเรียนแล้ว” ก่อน ไม่ได้แปลว่าเด็กถึงรถแล้ว — ยืนยันที่หน้างานเสมอ</li>
       <li>ห้ามถ่ายภาพหน้าจอคิว (มีชื่อเด็ก) ไปเผยแพร่ · ห้ามแชร์บัญชี</li></ul></div>`),
  page(2, header({ ic: "Drama", title: "สถานการณ์ฝึก (เล่นบทบาท)", sub: "ใช้บัญชีฝึก 3 บทบาท · กลุ่มละ 3 คน · ใช้เวลาสถานการณ์ละ ~3 นาที", badge: "ฝึกอบรม" }),
    table(["#", "สถานการณ์", "ผู้ปกครองทำ", "ครู/เจ้าหน้าที่ทำ", "ผ่านเมื่อ"], [
      ["1", "รับตามปกติ", "กด “ฉันกำลังไปรับ” แล้วเดินเข้าใกล้โรงเรียน", "ดูแถวในคิว ยืนยันตัว เรียก ส่ง", "ผู้ปกครองได้แจ้ง “ส่งนักเรียนแล้ว”"],
      ["2", "พี่น้องคนละห้อง", "เลือกนักเรียน 2 คนต่างห้อง", "ครูแต่ละห้อง **เรียก** เฉพาะเด็กห้องตัวเอง", "คิวเป็นแถวเดียว ไม่มีใครปล่อยเด็กห้องอื่น"],
      ["3", "ผู้รับแทน", "สร้างรหัสให้ “คุณลุง” ส่งรหัสให้เพื่อน", "ใส่รหัสที่ประตู ตรวจชื่อ/บัตร กดยืนยัน", "ใช้ซ้ำไม่ได้ ผู้ปกครองได้แจ้ง"],
      ["4", "ธงห้ามปล่อย", "—", "ผู้ดูแลติดธงให้เด็กหนึ่งคน → ประตูลองส่งเด็กคนนั้น", "ปุ่มส่งถูกปิด/ระบบปฏิเสธ แจ้งผู้ดูแล"],
      ["5", "พักการรับฉุกเฉิน", "ลองแจ้งมารับใหม่", "ผู้ดูแลส่งประกาศ + พักการรับ → ลองเรียก/ส่ง → เปิดรับอีกครั้ง", "ทุกจอเห็นแบนเนอร์ ปุ่มกลับมาใช้ได้หลังเปิดรับ"],
      ["6", "GPS ไม่ทำงาน", "กด “ฉันถึงประตูแล้ว”", "เห็นป้าย “แจ้งถึงเอง” → **ยืนยันตัวที่ประตู** ก่อนเรียก", "เจ้าหน้าที่ไม่ส่งเด็กจนกว่าตรวจตัวผู้รับแล้ว"],
      ["7", "ผู้ปกครองกดรับก่อน", "กด “รับนักเรียนแล้ว”", "แถวหายจากจอ ครูได้แจ้ง — **ตรวจที่หน้างานว่าเด็กไปกับใคร**", "ครู/เจ้าหน้าที่ไม่ปล่อยซ้ำและยืนยันกับผู้ปกครองได้"],
    ]) +
    `<div class="note"><span class="note-ic">${icon("ListChecks", 20, "#0b6e8a")}</span><div>ผู้สอนสังเกตว่าแต่ละกลุ่ม **หยุดและแจ้งผู้ดูแล** ในสถานการณ์ 4 และ 5 หรือไม่ — เป็นหัวใจความปลอดภัยของระบบ</div></div>`),
  page(3, header({ ic: "LifeBuoy", title: "แก้ปัญหาที่ประตู (ติดไว้ข้างจอ)", sub: "อาการที่พบบ่อย สาเหตุ และสิ่งที่ต้องทำ", badge: BIG_BADGE }),
    table(["อาการ", "น่าจะเกิดจาก", "ทำอย่างนี้"], [
      ["ไม่เห็นผู้ปกครองในคิว", "ผู้ปกครองยังไม่กดแจ้ง · ยังไม่ผ่านอนุมัติ · แจ้งหมดอายุ · อยู่นอกระยะ", "ให้ผู้ปกครองเปิดหน้า **รับนักเรียน** ดูข้อความ · ตรวจ “คำขอผูกนักเรียน” ว่าอนุมัติแล้วหรือยัง"],
      ["จอคิวขึ้น “กำลังเชื่อมต่อ” นาน", "อินเทอร์เน็ตหรือ Realtime ขัดข้อง", "รอสักครู่ ระบบจะถามซ้ำเอง (ไม่เกิน ~5 วินาที) · ถ้าไม่หายให้รีเฟรชหน้า · ตรวจ Wi-Fi"],
      ["กด “ส่งนักเรียนแล้ว” ไม่ได้", "ป้าย **ห้ามปล่อย** หรือกำลัง **พักการรับ**", "**อย่าฝืน** — แจ้งผู้ดูแลโรงเรียนทันที (เหตุผลเห็นเฉพาะผู้ดูแล)"],
      ["รหัสผู้รับแทนใช้ไม่ได้", "ใช้ไปแล้ว · หมดอายุ · ถูกยกเลิก · พิมพ์ผิด", "ให้ผู้ปกครองสร้างรหัสใหม่ · ถ้าไม่แน่ใจตัวผู้รับ ให้โทรหาผู้ปกครองตามเบอร์ในระบบก่อน"],
      ["ผู้ปกครองบอกไม่ได้รับแจ้ง", "ยังไม่ผูก LINE · ปิดการแจ้งเตือนของ LINE", "แจ้งเตือนในแอป (กระดิ่ง) ใช้ได้เสมอ · แนะนำให้ผูก LINE ที่ **บัญชีของฉัน**"],
      ["เสียงเรียกไม่ดัง", "ยังไม่ได้แตะ “เปิดเสียงเรียก” · ปิดเสียงเครื่อง · ไม่มีเสียงไทย", "แตะปุ่มเปิดเสียงหนึ่งครั้ง · ตรวจระดับเสียงเครื่อง · ถ้าไม่ได้ ใช้ชื่อบนจอแทน"],
      ["ตำแหน่งผู้ปกครองดูเก่า (ป้าย “ไม่อัปเดต”)", "ปิดหน้าจอ/พับแอป · ไม่มีสัญญาณ", "ให้ผู้ปกครองเปิดหน้าจอค้างไว้ · หรือกด “ฉันถึงประตูแล้ว”"],
      ["ผู้ปกครองสมัครแล้วเข้าไม่ได้/ยังไม่เห็นลูก", "รออนุมัติ · ชื่อที่พิมพ์ไม่ตรงรายชื่อ", "ผู้ดูแล/ครูประจำชั้นเปิด **คำขอผูกนักเรียน** เลือกนักเรียนที่ตรงกันแล้วอนุมัติ"],
    ]) +
    `<div class="note"><span class="note-ic">${icon("Phone", 20, "#0b6e8a")}</span><div><b>ติดต่อฉุกเฉิน:</b> ผู้ดูแลระบบของโรงเรียน ______________________ โทร ______________ · ผู้ดูแลแพลตฟอร์ม ______________________ โทร ______________</div></div>`),
  page(4, header({ ic: "ClipboardCheck", title: "Checklist นำร่อง และแบบบันทึกการอบรม", sub: "ใช้ก่อนเปิดห้องนำร่อง และบันทึกผู้ผ่านการอบรม", badge: "ฝึกอบรม" }),
    `<div class="cols2"><div class="panel"><div class="panel-h">ก่อนเปิดห้องนำร่อง (ผู้ดูแลติ๊ก)</div><ul class="chk">
      <li>ตั้งพิกัดโรงเรียน/ระยะ check-in/เวลาเลิกเรียนแล้ว</li><li>สร้างห้อง นำเข้านักเรียน ผูกครูประจำชั้นห้องนำร่องแล้ว</li><li>เชิญเจ้าหน้าที่ประตู (ลิงก์ใช้ได้ครั้งเดียว) แล้ว</li><li>ผู้ปกครองห้องนำร่องสมัครและได้รับอนุมัติแล้ว</li><li>ตั้งค่า LINE OA และทดสอบส่งการ์ดถึงมือถือจริงแล้ว</li><li>ทดสอบบนมือถือ iPhone และ Android อย่างน้อยอย่างละ 1 เครื่อง</li><li>ตั้งค่า GOOGLE_ROUTES_API_KEY และเพดานค่าใช้จ่ายแล้ว</li><li>ลบข้อมูลตัวอย่าง/บัญชีทดสอบทั้งหมดแล้ว</li><li>แจ้งผู้ปกครองห้องนำร่องล่วงหน้า (วิธีใช้ + ข้อมูลที่เก็บ)</li><li>ติดหน้า “แก้ปัญหาที่ประตู” ข้างจอแล้ว</li></ul></div>
     <div class="panel"><div class="panel-h">วันนำร่อง (เจ้าหน้าที่ติ๊กท้ายวัน)</div><ul class="chk">
      <li>มีผู้ปกครองใช้ระบบกี่คน: ______ คน</li><li>รับสำเร็จกี่ครั้ง: ______ ครั้ง</li><li>ปัญหาที่พบ: ______________________</li><li>ครั้งที่ต้องใช้วิธีเดิมแทนระบบ: ______ ครั้ง</li><li>เวลารอที่ประตูเฉลี่ย: ______ นาที (ดูที่หน้า สถิติ)</li><li>ข้อเสนอแนะจากครู/ผู้ปกครอง: __________</li><li>ตัดสินใจ: ขยายเพิ่ม □ แก้แล้วทดลองต่อ □ หยุดชั่วคราว □</li></ul></div></div>` +
    table(["ชื่อผู้เข้าอบรม", "บทบาท", "วันที่", "ทำสถานการณ์ 4–5 ผ่าน", "ลายมือชื่อ"], [["", "", "", "□", ""], ["", "", "", "□", ""], ["", "", "", "□", ""], ["", "", "", "□", ""], ["", "", "", "□", ""]])),
);

const CSS2 = `.tb{width:100%;border-collapse:collapse;font-size:12.6px;line-height:1.45}.tb th{background:var(--p);color:#fff;text-align:left;padding:7px 9px;font-weight:700}.tb td{border:1px solid var(--line);padding:7px 9px;vertical-align:top}.tb tr:nth-child(even) td{background:#f7fbfc}.tb b{color:var(--ps)}.bul,.chk{list-style:none;display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.45}.bul li::before{content:"•";color:var(--p);font-weight:800;margin-right:7px}.chk li::before{content:"☐";color:var(--p);margin-right:8px;font-size:15px}.cols2{display:grid;grid-template-columns:1fr 1fr;gap:12px}`;
const html = wrapHtml("KidGuard — คู่มือฉบับสั้น", pages).replace("</style>", CSS2 + "</style>");
const bold = (x) => x.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const html2 = wrapHtml("KidGuard — คู่มือฝึกอบรมครูและเจ้าหน้าที่", trainPages.map(bold)).replace("</style>", CSS2 + "</style>");
writeFileSync(path.join(OUT, "kidguard-quick-guide.html"), html);
writeFileSync(path.join(OUT, "kidguard-training.html"), html2);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
const pg = await ctx.newPage();
const names = ["overview", "parent-1-start", "parent-2-pickup", "parent-3-proxy-and-plan", "parent-4-line-and-install", "teacher", "student", "gate-queue-bigscreen", "admin-1-settings", "admin-2-classes-and-approvals", "admin-3-safety"];
for (const [doc, file, prefix, list] of [[html, "KidGuard-QuickGuide.pdf", "", names], [html2, "KidGuard-Training-Handbook.pdf", "training-", ["agenda", "scenarios", "troubleshooting", "checklist"]]]) {
  await pg.setContent(doc, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  await pg.pdf({ path: path.join(OUT, file), width: "210mm", height: "297mm", printBackground: true, preferCSSPageSize: true });
  const els = await pg.$$(".page");
  for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: path.join(OUT, "png", `${prefix}${String(i + 1).padStart(2, "0")}-${list[i]}.png`) });
  console.log("เสร็จ:", file, els.length, "หน้า");
}
await browser.close();
