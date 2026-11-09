// Supporter payments. verify_jwt = false; each provider is authenticated by its own secret.
//   Trakteer: POST ?provider=trakteer, header X-Webhook-Token == TRAKTEER_WEBHOOK_TOKEN
//   Saweria : POST ?provider=saweria,  header Saweria-Callback-Signature == HMAC-SHA256(SAWERIA_STREAM_KEY,
//             version+id+amount_raw+donator_name+donator_email) hex
// The supporter writes "#familyname" (e.g. "#saif2") in the support message so we can match the account
// (legacy "KM-3FA9C1" codes are still recognised).
// Unmatched payments are still stored (parent_id null) and can be linked by an admin.
import { admin, cors, json } from "../_shared/util.ts";

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
const safeEq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
};
const findName = (msg: string) => msg.match(/#([a-z][a-z0-9]{2,19})\b/i)?.[1]?.toLowerCase() ?? null;
const findCode = (msg: string) => msg.match(/\bKM-?([0-9A-F]{6})\b/i)?.[1]?.toUpperCase() ?? null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const provider = new URL(req.url).searchParams.get("provider");
  const raw = await req.text();
  let p: any; try { p = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }

  let ref: string, amount: number, name: string, message: string;
  if (provider === "trakteer") {
    const secret = Deno.env.get("TRAKTEER_WEBHOOK_TOKEN");
    if (!secret || !safeEq(req.headers.get("X-Webhook-Token") ?? "", secret)) return json({ error: "unauthorized" }, 401);
    ref = String(p.transaction_id ?? ""); amount = Number(p.price ?? 0);
    name = String(p.supporter_name ?? ""); message = String(p.supporter_message ?? "");
  } else if (provider === "saweria") {
    const key = Deno.env.get("SAWERIA_STREAM_KEY");
    const sig = req.headers.get("Saweria-Callback-Signature") ?? "";
    const expect = key ? await hmac(key, `${p.version}${p.id}${p.amount_raw}${p.donator_name}${p.donator_email}`) : "";
    if (!key || !safeEq(sig.toLowerCase(), expect)) return json({ error: "unauthorized" }, 401);
    ref = String(p.id ?? ""); amount = Number(p.amount_raw ?? 0);
    name = String(p.donator_name ?? ""); message = String(p.message ?? "");
  } else return json({ error: "unknown provider" }, 400);

  if (!ref || !(amount > 0)) return json({ error: "missing fields" }, 400);
  const db = admin();
  let parentId: string | null = null;
  const famName = findName(message);
  if (famName) {
    const { data } = await db.from("families").select("parent_id").eq("handle", famName).maybeSingle();
    parentId = data?.parent_id ?? null;
  }
  const code = parentId ? null : findCode(message);
  if (code) {
    const { data } = await db.from("families").select("parent_id").eq("code", code).maybeSingle();
    parentId = data?.parent_id ?? null;
  }
  const { error } = await db.from("payments").upsert(
    { provider, provider_ref: ref, parent_id: parentId, amount_idr: Math.round(amount), supporter_name: name, message, raw: p },
    { onConflict: "provider,provider_ref", ignoreDuplicates: true },
  );
  if (error) return json({ error: error.message }, 500);
  if (parentId) await db.rpc("recompute_supporter_tier", { p: parentId });
  return json({ ok: true, matched: !!parentId });
});
