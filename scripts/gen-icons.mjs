// สร้างไอคอน PNG (favicon, PWA, maskable, apple-touch) จากต้นแบบ SVG ใน assets/brand
import sharp from "sharp";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";

const out = "public/icons";
await mkdir(out, { recursive: true });
const logo = await readFile("assets/brand/logo.svg");
const fav = await readFile("assets/brand/favicon.svg");

const png = (svg, size) => sharp(svg, { density: 384 }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();

await copyFile("assets/brand/logo.svg", `${out}/logo.svg`);
await writeFile(`${out}/icon-192.png`, await png(logo, 192));
await writeFile(`${out}/icon-512.png`, await png(logo, 512));
for (const s of [32, 48]) await writeFile(`${out}/favicon-${s}.png`, await png(fav, s));

// maskable: พื้นเต็มสี + โลโก้ในพื้นที่ปลอดภัย 62%
const maskable = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0b6e8a" } })
  .composite([{ input: await png(logo, 318), gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(`${out}/maskable-512.png`, maskable);

// apple-touch-icon: ต้องทึบ (ไม่โปร่งใส)
const apple = await sharp({ create: { width: 180, height: 180, channels: 4, background: "#f5fafb" } })
  .composite([{ input: await png(logo, 140), gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(`${out}/apple-touch-icon.png`, apple);
console.log("icons generated in", out);
