// ชุดเครื่องมือกลางสำหรับสร้างคู่มือ PDF ของ KidGuard (ฟอนต์/สี/หน้ากระดาษ/ตัดภาพหน้าจอ) ใช้โดย build-guides.mjs และ build-manual.mjs
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

export const ROOT_DIR = ROOT; export const OUT_DIR = OUT;
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
export const setDoc = (d) => { DOC = d; };
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

const CSS2 = `.tb{width:100%;border-collapse:collapse;font-size:12.6px;line-height:1.45}.tb th{background:var(--p);color:#fff;text-align:left;padding:7px 9px;font-weight:700}.tb td{border:1px solid var(--line);padding:7px 9px;vertical-align:top}.tb tr:nth-child(even) td{background:#f7fbfc}.tb b{color:var(--ps)}.bul,.chk{list-style:none;display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.45}.bul li::before{content:"•";color:var(--p);font-weight:800;margin-right:7px}.chk li::before{content:"☐";color:var(--p);margin-right:8px;font-size:15px}.cols2{display:grid;grid-template-columns:1fr 1fr;gap:12px}`;
const wrapHtml = (title, list) => `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${list.join("")}</body></html>`;
export const html = (title, list) => wrapHtml(title, list.map((x) => x.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"))).replace("</style>", CSS2 + "</style>");
export { icon, md, dims, dataUrl, crop, phone, screen, M, D, header, steps, note, page, PHONE_BADGE, BIG_BADGE, PC_BADGE, SHOTS, OUT, ROOT, DOC, chromium, mkdirSync, writeFileSync, readFileSync, path };
