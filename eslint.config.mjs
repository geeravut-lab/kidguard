import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// กติกาข้อ 3 ของโครงการ: ทุกปุ่มที่กดแล้วต้องรอ ต้องมีสปินเนอร์ → ห้ามใช้ <button>/<form> ดิบ
const RAW_BUTTON = {
  selector: "JSXOpeningElement[name.name='button']",
  message:
    "ห้ามใช้ <button> ดิบ — ใช้ <Button>/<AsyncButton>/<SubmitButton> จาก '@/components/ui' เพื่อให้มีสปินเนอร์และกันกดซ้ำ",
};
const RAW_FORM = {
  selector: "JSXOpeningElement[name.name='form']",
  message: "ห้ามใช้ <form> ดิบ — ใช้ <AsyncForm> จาก '@/components/ui' เพื่อให้ปุ่ม submit แสดงสปินเนอร์",
};
const RAW_ANCHOR_NAV = {
  selector: "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='href'][value.value=/^\\//]",
  message: "ลิงก์ภายในใช้ <AsyncLink> (มีตัวบอกกำลังโหลด) แทน <a href='/...'>",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": ["error", RAW_BUTTON, RAW_FORM, RAW_ANCHOR_NAV],
    },
  },
  {
    // คอมโพเนนต์กลางเท่านั้นที่ใช้ของดิบได้
    files: ["src/components/ui/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  globalIgnores([".next/**", "out/**", "node_modules/**", "next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
