// Child sign-in without email. verify_jwt = false (does its own checks).
// Step 1: POST { family_code }              -> { children: [{id, display_name, avatar}] }
// Step 2: POST { family_code, child_id, pin } -> { token_hash }  (client: supabase.auth.verifyOtp({ token_hash, type: "magiclink" }))
import { admin, childEmail, cors, json } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = admin();
    const body = await req.json();
    const code = String(body.family_code ?? "").trim().toUpperCase().replace(/^KM-?/, "");
    if (!/^[0-9A-F]{6}$/.test(code)) return json({ error: "Kode keluarga 6 karakter" }, 400);
    const { data: fam } = await db.from("families").select("parent_id").eq("code", code).maybeSingle();
    if (!fam) { await new Promise((r) => setTimeout(r, 600)); return json({ error: "Kode keluarga tidak ditemukan" }, 404); }

    const { data: links } = await db.from("family_members").select("child_id").eq("parent_id", fam.parent_id);
    const ids = (links ?? []).map((l) => l.child_id);

    if (!body.child_id) {
      if (!ids.length) return json({ children: [] });
      const { data: kids } = await db.from("profiles").select("id, display_name, avatar").in("id", ids).order("created_at");
      return json({ children: kids ?? [] });
    }

    if (!ids.includes(body.child_id)) return json({ error: "Anak tidak ditemukan" }, 404);
    const res = await db.rpc("check_child_pin", { child: body.child_id, pin: String(body.pin ?? "") });
    if (res.error) return json({ error: res.error.message }, 500);
    if (res.data === "locked") return json({ error: "Terlalu banyak salah. Tunggu 10 menit, atau minta Ayah/Ibu ganti PIN." }, 429);
    if (res.data !== "ok") return json({ error: "PIN salah" }, 401);

    const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email: childEmail(body.child_id) });
    if (le || !link?.properties?.hashed_token) return json({ error: le?.message ?? "Gagal masuk" }, 500);
    await db.from("activity_log").insert({ profile_id: body.child_id, kind: "login", detail: {} });
    return json({ token_hash: link.properties.hashed_token });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
