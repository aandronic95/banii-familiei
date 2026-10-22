// Primește plățile Apple Pay trimise de Scurtături (iOS → Automatizare „Tranzacție”)
// și le salvează ca cheltuieli. Autentificare: cheia secretă a telefonului, în corpul cererii.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { tg } from "../_shared/telegram.ts";
import { guessCategoryIcon, matchAccount, parseWalletAmount } from "../_shared/wallet.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const enc = new TextEncoder();
async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const fmt = (n: number) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ ok: false, error: "method" }, 405);

  // Scurtăturile pot trimite JSON sau formular
  let body: Record<string, unknown> = {};
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) body = await req.json();
    else body = Object.fromEntries(new URLSearchParams(await req.text()));
  } catch { return reply({ ok: false, error: "bad_request", message: "Date invalide" }, 400); }

  const token = String(body.token ?? req.headers.get("x-wallet-token") ?? "").trim();
  if (token.length < 24) return reply({ ok: false, error: "unauthorized", message: "Cheia lipsește" }, 401);
  const { data: dev } = await db.from("device_tokens").select("id, family_id, member_id, user_id, name").eq("token_hash", await sha256(token)).maybeSingle();
  if (!dev) return reply({ ok: false, error: "unauthorized", message: "Cheie invalidă sau anulată" }, 401);

  const { data: member } = await db.from("members").select("id, name, telegram_id, lang, role").eq("id", dev.member_id).maybeSingle();
  if (!member || member.role === "none") return reply({ ok: false, error: "forbidden", message: "Fără acces" }, 403);

  const parsed = parseWalletAmount(body.amount);
  if (!parsed) return reply({ ok: false, error: "amount", message: "Nu am înțeles suma" }, 400);
  const merchant = String(body.merchant ?? "").trim().slice(0, 60) || null;
  const card = String(body.card ?? "").trim().slice(0, 80);

  await db.from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", dev.id);

  // Contul
  const { data: accounts } = await db.from("accounts").select("id, name, type, currency, bank, last4, wallet_alias, member_id, archived").eq("family_id", dev.family_id);
  const { account, sure } = matchAccount(card, parsed.currency, accounts ?? [], dev.member_id);
  if (!account) return reply({ ok: false, error: "no_account", message: "Adaugă întâi un card în aplicație" }, 422);

  // Anti-dublură: aceeași sumă, același magazin, în ultimele 3 minute
  const since = new Date(Date.now() - 3 * 60000).toISOString();
  const dupQ = db.from("transactions").select("id").eq("family_id", dev.family_id).eq("account_id", account.id)
    .eq("amount", parsed.amount).gte("created_at", since).limit(1);
  const { data: dup } = merchant ? await dupQ.eq("merchant", merchant) : await dupQ;
  if (dup?.length) return reply({ ok: true, duplicate: true, id: dup[0].id, message: "Deja salvată" });

  // Categoria: ce s-a folosit ultima dată la același magazin, altfel după cuvinte-cheie
  const { data: cats } = await db.from("categories").select("id, icon, name_ro, name_ru, kind, archived").eq("family_id", dev.family_id).eq("kind", "expense");
  let categoryId: string | null = null;
  let carKind: string | null = null;
  if (merchant) {
    const { data: prev } = await db.from("transactions").select("category_id, car_kind").eq("family_id", dev.family_id)
      .ilike("merchant", merchant).not("category_id", "is", null).order("created_at", { ascending: false }).limit(1);
    if (prev?.[0]) { categoryId = prev[0].category_id; carKind = prev[0].car_kind; }
  }
  if (!categoryId) {
    const icon = guessCategoryIcon(merchant);
    const c = icon ? (cats ?? []).find((x) => x.icon === icon && !x.archived) : null;
    if (c) { categoryId = c.id; if (icon === "car") carKind = "fuel"; }
  }
  let carId: string | null = null;
  if (carKind) {
    const { data: cars } = await db.from("cars").select("id").eq("family_id", dev.family_id).order("created_at").limit(1);
    carId = cars?.[0]?.id ?? null;
    if (!carId) carKind = null;
  }

  const { data: tx, error } = await db.from("transactions").insert({
    family_id: dev.family_id, kind: "expense", amount: parsed.amount, account_id: account.id,
    category_id: categoryId, member_id: dev.member_id, date: todayLocal(), merchant,
    note: "Apple Pay" + (sure ? "" : " · verifică contul"), created_by: dev.user_id,
    car_id: carId, car_kind: carKind,
  }).select("id").single();
  if (error || !tx) return reply({ ok: false, error: "save_failed", message: "Nu am putut salva" }, 500);

  const cat = (cats ?? []).find((c) => c.id === categoryId);
  const ru = member.lang === "ru";
  const catName = cat ? (ru ? cat.name_ru : cat.name_ro) : (ru ? "без категории" : "fără categorie");
  const line = `−${fmt(parsed.amount)} ${account.currency}${merchant ? " · " + merchant : ""} · ${catName}`;

  if (BOT_TOKEN && member.telegram_id) {
    const head = ru ? "💳 Добавлено из Apple Pay" : "💳 Adăugat din Apple Pay";
    const warn = sure ? "" : ru ? `\n⚠️ Проверьте счёт: «${account.name}»` : `\n⚠️ Verifică contul: „${account.name}”`;
    await tg(BOT_TOKEN, "sendMessage", {
      chat_id: member.telegram_id,
      text: `${head}\n${line}\n${account.name}${warn}`,
      reply_markup: { inline_keyboard: [[{ text: ru ? "Изменить" : "Modifică", web_app: { url: `${APP_URL}?tx=${tx.id}` } }]] },
    }).catch(() => {});
  }

  return reply({ ok: true, id: tx.id, message: line });
});
