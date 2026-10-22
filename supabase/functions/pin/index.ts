// Codul de rezervă pentru blocarea aplicației.
//   { action: "status" }                     → { hasPin }
//   { action: "set", pin, current? }         → setează / schimbă (schimbarea cere codul vechi)
//   { action: "verify", pin }                → { ok } sau { error: "wrong" | "locked", retryIn }
//   { action: "clear", pin }                 → șterge codul (cere codul)
//   { action: "forgot" }                     → botul trimite un cod de resetare (10 minute)
//   { action: "reset", code }                → șterge codul uitat
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { cors, json, tg } from "../_shared/telegram.ts";
import { hashPin, lockMinutes, newSalt, safeEqual, validPin } from "../_shared/pin.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const uid = u.user.id;
  const { data: member } = await db.from("members").select("telegram_id, lang, role").eq("user_id", uid).in("role", ["owner", "editor"]).maybeSingle();
  if (!member) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const { data: row } = await db.from("member_pins").select("*").eq("user_id", uid).maybeSingle();

  // Verifică un cod, cu limită de încercări
  async function check(pin: unknown): Promise<Response | null> {
    if (!row) return json({ error: "no_pin" }, 400);
    if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
      return json({ error: "locked", retryIn: Math.ceil((Date.parse(row.locked_until) - Date.now()) / 1000) }, 429);
    }
    if (!validPin(pin)) return json({ error: "wrong" }, 400);
    const ok = safeEqual(await hashPin(pin as string, row.salt), row.pin_hash);
    if (ok) {
      if (row.failed) await db.from("member_pins").update({ failed: 0, locked_until: null }).eq("user_id", uid);
      return null;
    }
    const failed = row.failed + 1;
    const mins = lockMinutes(failed);
    const locked_until = mins ? new Date(Date.now() + mins * 60000).toISOString() : null;
    await db.from("member_pins").update({ failed, locked_until }).eq("user_id", uid);
    return json({ error: mins ? "locked" : "wrong", left: Math.max(0, 5 - failed), retryIn: mins * 60 }, mins ? 429 : 400);
  }

  if (action === "status") return json({ hasPin: !!row });

  if (action === "verify") {
    const bad = await check(body.pin);
    return bad ?? json({ ok: true });
  }

  if (action === "set") {
    if (!validPin(body.pin)) return json({ error: "invalid" }, 400);
    if (row) { const bad = await check(body.current); if (bad) return bad; }
    const salt = newSalt();
    await db.from("member_pins").upsert({ user_id: uid, salt, pin_hash: await hashPin(body.pin, salt), failed: 0, locked_until: null, reset_hash: null, reset_expires: null, updated_at: new Date().toISOString() });
    return json({ ok: true });
  }

  if (action === "clear") {
    const bad = await check(body.pin);
    if (bad) return bad;
    await db.from("member_pins").delete().eq("user_id", uid);
    return json({ ok: true });
  }

  if (action === "forgot") {
    if (!row || !member.telegram_id) return json({ error: "no_pin" }, 400);
    if (row.reset_expires && Date.parse(row.reset_expires) - 9 * 60000 > Date.now()) return json({ ok: true }); // max. un cod pe minut
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.from("member_pins").update({ reset_hash: await hashPin(code, row.salt), reset_expires: new Date(Date.now() + 10 * 60000).toISOString() }).eq("user_id", uid);
    const ru = member.lang === "ru";
    await tg(BOT_TOKEN, "sendMessage", {
      chat_id: member.telegram_id, parse_mode: "HTML",
      text: ru ? `🔑 Код для сброса PIN: <code>${code}</code>\nДействует 10 минут. Если это были не вы, просто проигнорируйте.` : `🔑 Codul pentru resetarea PIN-ului: <code>${code}</code>\nE valabil 10 minute. Dacă nu ai cerut tu, ignoră mesajul.`,
    });
    return json({ ok: true });
  }

  if (action === "reset") {
    if (!row?.reset_hash || !row.reset_expires || Date.parse(row.reset_expires) < Date.now()) return json({ error: "expired" }, 400);
    if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) return json({ error: "wrong" }, 400);
    if (!safeEqual(await hashPin(body.code, row.salt), row.reset_hash)) {
      const failed = row.failed + 1;
      await db.from("member_pins").update({ failed, reset_hash: failed >= 10 ? null : row.reset_hash }).eq("user_id", uid);
      return json({ error: "wrong" }, 400);
    }
    await db.from("member_pins").delete().eq("user_id", uid);
    return json({ ok: true });
  }

  return json({ error: "bad_action" }, 400);
});
