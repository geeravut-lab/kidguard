/* Service worker ขั้นต่ำ: แคชเฉพาะหน้า /offline กับไอคอน
 * ห้ามแคชหน้าที่มีข้อมูลของผู้ใช้ (เครื่องใช้ร่วมกัน / ออกจากระบบแล้วต้องไม่เหลือข้อมูล) */
const CACHE = "kg-shell-v1";
const PRECACHE = ["/offline", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // เฉพาะการนำทางหน้าเว็บ: ถ้าออฟไลน์ ให้แสดงหน้า /offline; ที่เหลือปล่อยเครือข่ายตามปกติ (ไม่แคช)
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
  }
});
