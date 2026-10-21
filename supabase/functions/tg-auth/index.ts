// Login: verifică semnătura Telegram, verifică lista de membri și dă o sesiune Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { cors, json, verifyInitData } from "../_shared/telegram.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const OWNER_ID = Number(Deno.env.get("OWNER_TELEGRAM_ID") ?? "0");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: { initData?: string; invite?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const user = await verifyInitData(body.initData ?? "", BOT_TOKEN);
  if (!user) return json({ error: "bad_signature" }, 401);

  const tgId = user.id;
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Eu";
  const email = `tg${tgId}@telegram.banii-familiei.app`;

  const { data: member } = await admin.from("members").select("id, user_id, role").eq("telegram_id", tgId).maybeSingle();

  const allowedByRole = member && (member.role === "owner" || member.role === "editor");
  const invite = (body.invite ?? "").trim();
  const isOwnerBootstrap = !member && OWNER_ID && tgId === OWNER_ID;

  if (!allowedByRole && !invite && !isOwnerBootstrap) {
    return json({ error: "not_allowed", telegram_id: tgId }, 403);
  }

  // Asigură existența contului de autentificare pentru acest utilizator Telegram
  await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { telegram_id: tgId, name: displayName } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link?.user) return json({ error: "auth_failed" }, 500);
  const uid = link.user.id;

  if (allowedByRole) {
    if (member!.user_id !== uid) await admin.from("members").update({ user_id: uid }).eq("id", member!.id);
  } else if (invite) {
    const { error } = await admin.rpc("accept_invite", { p_code: invite, p_user: uid, p_tg: tgId, p_name: displayName });
    if (error) return json({ error: "invite_invalid", message: error.message }, 403);
  } else if (isOwnerBootstrap) {
    const { error } = await admin.rpc("bootstrap_family", { p_user: uid, p_tg: tgId, p_name: displayName });
    if (error) return json({ error: "bootstrap_failed", message: error.message }, 500);
  }

  return json({ token_hash: link.properties.hashed_token, email });
});
