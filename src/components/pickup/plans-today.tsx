import { Card } from "@/components/parent/sections";
import type { Dict } from "@/lib/i18n/dict";
import type { PlanRow } from "@/lib/safety/read";

const ORDER = ["bus", "absent", "other", "parent"] as const;

/** แผนการกลับวันนี้ (ผู้ปกครองแจ้งล่วงหน้า): จัดกลุ่มตามวิธีกลับ — ครูเห็นเฉพาะห้องตัวเอง (กรองที่ฐานข้อมูล) */
export function PlansToday({ plans, t }: { plans: PlanRow[]; t: Dict }) {
  return (
    <Card title={t.gate_plans_title}>
      {plans.length === 0 ? (
        <p className="text-ink-soft" data-testid="plans-empty">{t.gate_plans_empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="plans-today">
          {ORDER.map((m) => {
            const list = plans.filter((p) => p.mode === m);
            if (!list.length) return null;
            return (
              <div key={m} className="rounded-xl border border-line p-3">
                <p className="font-semibold">{t[`plans_mode_${m}` as const]} <span className="text-ink-soft">({list.length})</span></p>
                <p className="mt-1 text-sm text-ink-soft">{list.map((p) => `${p.nickname}${p.classroom ? ` ${p.classroom}` : ""}`).join(", ")}</p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
