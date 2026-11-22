import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { exchangeTicket, parseHubPayload, SsoError, syntheticEmail } from "@/lib/sso/exchange";
import { admin, ANON, cleanup, HAS_DB, makeUser, rid, URL_ } from "./helpers";

const d = describe.skipIf(!HAS_DB);
const SLUG = "kidguard";
const HOST = "kidguards.vercel.app";

/** hub จำลอง: คืน payload ตามที่กำหนด */
const hub = (payload: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
const payload = (u: Record<string, unknown>, slug = SLUG) => ({ user: { display_name: null, avatar_url: null, email: null, roles: ["admin", "super_admin"], ...u }, app_slug: slug, firebase: null });
const run = (ticket: unknown, f: typeof fetch) => exchangeTicket(ticket, { admin: admin(), slug: SLUG, hubBase: "https://hub.example", siteHost: HOST, fetchImpl: f });
const createdHubIds: string[] = [];
const hubId = () => {
  const id = "zz_test_hub_" + rid();
  createdHubIds.push(id);
  return id;
};

d("Aivora SSO exchange (hub จำลอง + Supabase จริง)", () => {
  afterAll(async () => {
    const a = admin();
    for (const id of createdHubIds) {
      const { data } = await a.from("aivora_links").select("user_id").eq("aivora_user_id", id).maybeSingle();
      if (data?.user_id) await a.auth.admin.deleteUser(data.user_id);
    }
    await cleanup();
  });

  it("ผู้ใช้ใหม่ (display_name/email/avatar เป็น null): สร้างบัญชี ผูก aivora_user_id ออก session ที่ใช้ได้จริง", async () => {
    const id = hubId();
    const r = await run("tkt", hub(payload({ id })));
    expect(r.created).toBe(true);
    const a = admin();
    const u = (await a.auth.admin.getUserById(r.user_id)).data.user!;
    expect(u.app_metadata.aivora_user_id).toBe(id);
    expect(u.email).toBe(syntheticEmail(id, HOST));
    // session ใช้ได้กับ RLS: ผู้ใช้เห็นโปรไฟล์ตัวเองและไม่มีสิทธิ์พิเศษ
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    expect((await c.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token })).error).toBeNull();
    const me = (await c.rpc("kg_me")).data;
    expect(me.user_id).toBe(r.user_id);
    expect(me.role).toBeNull();
    expect(me.platform_admin).toBe(false);
    expect(me.memberships).toEqual([]);
  });

  it("ล็อกอินซ้ำ: ได้ผู้ใช้เดิม ไม่สร้างซ้ำ และไม่เขียนทับชื่อที่ผู้ใช้แก้เอง", async () => {
    const id = hubId();
    const first = await run("t1", hub(payload({ id, display_name: "ชื่อจาก hub" })));
    const a = admin();
    await a.from("profiles").update({ display_name: "ชื่อที่แก้เอง" }).eq("id", first.user_id);
    const second = await run("t2", hub(payload({ id, display_name: "ชื่อใหม่จาก hub" })));
    expect(second.created).toBe(false);
    expect(second.user_id).toBe(first.user_id);
    expect((await a.from("profiles").select("display_name").eq("id", first.user_id).single()).data?.display_name).toBe("ชื่อที่แก้เอง");
  });

  it("ห้ามผูกบัญชีด้วยอีเมล: hub ส่งอีเมลของผู้ใช้ที่สมัครไว้แล้ว → ได้บัญชีใหม่แยกต่างหาก ไม่ได้ session ของคนนั้น", async () => {
    const victim = await makeUser("victim");
    const id = hubId();
    const r = await run("tkt", hub(payload({ id, email: victim.email })));
    expect(r.created).toBe(true);
    expect(r.user_id).not.toBe(victim.id);
    const u = (await admin().auth.admin.getUserById(r.user_id)).data.user!;
    expect(u.email).not.toBe(victim.email);
  });

  it("roles จาก hub (admin/super_admin) ไม่ให้สิทธิ์ใด ๆ ในแอปนี้", async () => {
    const r = await run("tkt", hub(payload({ id: hubId(), roles: ["admin", "super_admin", "owner"] })));
    const row = await admin().from("platform_admins").select("user_id").eq("user_id", r.user_id);
    expect(row.data).toEqual([]);
    expect((await admin().from("school_members").select("user_id").eq("user_id", r.user_id)).data).toEqual([]);
  });

  it("ปฏิเสธ: slug ไม่ตรง (403), payload รูปร่างผิด (502), user.id ว่างหรือไม่ใช่ string (502)", async () => {
    await expect(run("t", hub(payload({ id: hubId() }, "other-app")))).rejects.toMatchObject({ status: 403, code: "slug_mismatch" });
    await expect(run("t", hub({ nope: true }))).rejects.toMatchObject({ status: 502 });
    await expect(run("t", hub(payload({ id: "" })))).rejects.toMatchObject({ status: 502 });
    await expect(run("t", hub(payload({ id: 123 })))).rejects.toMatchObject({ status: 502 });
    await expect(run("t", hub(payload({ id: hubId(), email: 5 })))).rejects.toMatchObject({ status: 502 }); // ไม่ใช่ null/string
  });

  it("รหัสสถานะสื่อความหมาย: ตั๋วไม่ถูกต้อง = 401, hub ล่ม = 502, hub ติดต่อไม่ได้ = 502", async () => {
    await expect(run("bad", hub({ error: "invalid_ticket" }, 400))).rejects.toMatchObject({ status: 401, code: "invalid_ticket" });
    await expect(run("bad", hub({}, 503))).rejects.toMatchObject({ status: 502, code: "hub_error" });
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(run("t", down)).rejects.toMatchObject({ status: 502, code: "hub_unreachable" });
    await expect(run("", hub({}))).rejects.toMatchObject({ status: 401 });
    await expect(run(12345 as unknown, hub({}))).rejects.toBeInstanceOf(SsoError);
  });

  it("ส่งเฉพาะ access/refresh token (ไม่คืน service_role หรือข้อมูลอื่น)", async () => {
    const r = await run("tkt", hub(payload({ id: hubId() })));
    expect(Object.keys(r).sort()).toEqual(["access_token", "created", "refresh_token", "user_id"]);
    expect(JSON.stringify(r)).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY!);
  });

  it("แข่งกันแลกตั๋ว aivora_user_id เดียวกัน 2 ครั้งพร้อมกัน → ผู้ใช้คนเดียว", async () => {
    const id = hubId();
    const [a, b] = await Promise.all([run("t1", hub(payload({ id }))), run("t2", hub(payload({ id })))]);
    expect(a.user_id).toBe(b.user_id);
    const links = await admin().from("aivora_links").select("user_id").eq("aivora_user_id", id);
    expect(links.data?.length).toBe(1);
  });
});

d("parseHubPayload", () => {
  it("firebase: null ไม่ใช่ error และ null ในช่องที่ไม่มีค่าใช้ได้", () => {
    expect(parseHubPayload({ user: { id: "u1", display_name: null, avatar_url: null, email: null }, app_slug: SLUG, firebase: null }, SLUG).id).toBe("u1");
  });
});
