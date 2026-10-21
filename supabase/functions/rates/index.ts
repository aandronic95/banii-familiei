// Cursul BNM la cerere, pentru membrii familiei autentificați.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { cors, json } from "../_shared/telegram.ts";
import { ratesFor } from "../_shared/bnm.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Doar membrii unei familii pot cere cursul (ca funcția să nu poată fi folosită de oricine)
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: m } = await db.from("members").select("id").eq("user_id", u.user.id).in("role", ["owner", "editor"]).maybeSingle();
  if (!m) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const today = todayLocal();
  let date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today;
  if (date > today) date = today;
  if (date < "2000-01-01") date = "2000-01-01";

  return json(await ratesFor(db, date));
});
