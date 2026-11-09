// Parent-only family management. Requires the parent's JWT (verify_jwt = true).
// POST { action: "create", display_name, avatar, pin }
// POST { action: "set_pin", child_id, pin }
// POST { action: "delete", child_id }
import { admin, childEmail, cors, json } from "../_shared/util.ts";

const MAX_CHILDREN = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = admin();
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error: ue } = await db.auth.getUser(jwt);
    if (ue || !u?.user) return json({ error: "Harus masuk sebagai orang tua" }, 401);
    const parentId = u.user.id;
    const { data: me } = await db.from("profiles").select("role").eq("id", parentId).single();
    if (me?.role !== "parent") return json({ error: "Hanya akun orang tua" }, 403);

    const body = await req.json();
    const pin = String(body.pin ?? "");
    const ownsChild = async (id: string) => {
      const { data } = await db.from("family_members").select("child_id").eq("child_id", id).eq("parent_id", parentId).maybeSingle();
      return !!data;
    };

    if (body.action === "create") {
      const name = String(body.display_name ?? "").trim().slice(0, 40);
      if (!name) return json({ error: "Nama anak wajib diisi" }, 400);
      if (!/^[0-9]{4,6}$/.test(pin)) return json({ error: "PIN harus 4-6 angka" }, 400);
      const { count } = await db.from("family_members").select("*", { count: "exact", head: true }).eq("parent_id", parentId);
      if ((count ?? 0) >= MAX_CHILDREN) return json({ error: `Maksimal ${MAX_CHILDREN} anak` }, 400);

      const id = crypto.randomUUID();
      const { data: created, error: ce } = await db.auth.admin.createUser({
        id, email: childEmail(id), email_confirm: true,
        password: crypto.randomUUID() + crypto.randomUUID(),
        user_metadata: { kind: "child", display_name: name },
      } as any);
      if (ce || !created?.user) return json({ error: ce?.message ?? "Gagal membuat akun anak" }, 500);
      const childId = created.user.id;

      // supporter tier is inherited from the parent
      const { data: pp } = await db.from("profiles").select("supporter_tier").eq("id", parentId).single();
      const steps = [
        db.from("profiles").insert({ id: childId, role: "child", display_name: name, avatar: Number(body.avatar) || 0, supporter_tier: pp?.supporter_tier ?? 0 }),
      ];
      for (const s of steps) { const { error } = await s; if (error) { await db.auth.admin.deleteUser(childId); return json({ error: error.message }, 500); } }
      // link to this parent and, if linked, their spouse
      const { data: sp } = await db.from("spouses").select("parent_a, parent_b").or(`parent_a.eq.${parentId},parent_b.eq.${parentId}`).maybeSingle();
      const spouseId = sp ? (sp.parent_a === parentId ? sp.parent_b : sp.parent_a) : null;
      const links = [{ child_id: childId, parent_id: parentId }, ...(spouseId ? [{ child_id: childId, parent_id: spouseId }] : [])];
      const { error: le } = await db.from("family_members").insert(links);
      if (le) { await db.auth.admin.deleteUser(childId); return json({ error: le.message }, 500); }
      const { error: pe } = await db.rpc("set_child_pin", { child: childId, pin });
      if (pe) { await db.auth.admin.deleteUser(childId); return json({ error: pe.message }, 400); }
      return json({ child_id: childId, display_name: name });
    }

    if (body.action === "set_pin") {
      if (!(await ownsChild(body.child_id))) return json({ error: "Bukan anak Anda" }, 403);
      const { error } = await db.rpc("set_child_pin", { child: body.child_id, pin });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      if (!(await ownsChild(body.child_id))) return json({ error: "Bukan anak Anda" }, 403);
      const { error } = await db.auth.admin.deleteUser(body.child_id); // cascades to profile and all content
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Aksi tidak dikenal" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
