// Apelat de aplicație după ce salvezi o cheltuială: anunță ceilalți adulți dacă suma trece de pragul lor.
// Cere login; poți declanșa doar pentru o tranzacție din familia ta.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { cors, json } from "../_shared/telegram.ts";
import { bigSpendAlert } from "../_shared/alert.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(body.ids) ? body.ids : [body.id]).filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
  if (!ids.length) return json({ error: "bad_request" }, 400);

  const { data: rows } = await db.from("transactions").select("id, family_id").in("id", ids);
  const { data: mine } = await db.from("members").select("family_id").eq("user_id", u.user.id).in("role", ["owner", "editor"]);
  const fams = new Set((mine ?? []).map((m: any) => m.family_id));
  let sent = 0;
  for (const r of rows ?? []) if (fams.has(r.family_id)) sent += await bigSpendAlert(db, BOT_TOKEN, APP_URL, r.id);
  return json({ ok: true, sent });
});
