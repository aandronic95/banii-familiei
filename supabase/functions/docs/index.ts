// Raport lunar PDF și export Excel, trimise ca fișier în Telegram.
//   POST /docs?type=report&month=2026-10   (din aplicație, cu sesiunea utilizatorului)
//   POST /docs?type=export
//   POST /docs?type=report&all=1           (programat: luna trecută, tuturor celor abonați)
//   POST /docs?type=export&all=1           (programat: backup săptămânal, celor care l-au cerut)
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { buildExport, buildReport, L } from "../_shared/docs_build.ts";
import { cors, derivedSecret, json } from "../_shared/telegram.ts";
import { schedule } from "../_shared/loan.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());

// ───────── Datele familiei ─────────
async function all(table: string, familyId: string, order = "created_at") {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from(table).select("*").eq("family_id", familyId).order(order).range(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function loadFamily(familyId: string) {
  const [family, members, accounts, categories, transactions, loans, loanPayments, investments, debts, goals, recurring] = await Promise.all([
    db.from("families").select("*").eq("id", familyId).single().then((r) => r.data),
    all("members", familyId), all("accounts", familyId, "sort"), all("categories", familyId, "sort"),
    all("transactions", familyId, "date"), all("loans", familyId), all("loan_payments", familyId, "n"),
    all("investments", familyId), all("debts", familyId), all("goals", familyId), all("recurring", familyId, "next_date"),
  ]);
  const rates: Record<string, number> = { MDL: 1 };
  for (const c of ["EUR", "USD"]) {
    const { data } = await db.from("rates").select("rate").eq("currency", c).order("date", { ascending: false }).limit(1);
    if (data?.[0]) rates[c] = Number(data[0].rate);
  }
  const accById = Object.fromEntries(accounts.map((a: any) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c: any) => [c.id, c]));
  const memById = Object.fromEntries(members.map((m: any) => [m.id, m]));
  const toMdl = (v: number, cur: string) => Number(v) * (rates[cur] ?? 1);
  const txCur = (t: any) => accById[t.account_id]?.currency ?? "MDL";
  const balances: Record<string, number> = Object.fromEntries(accounts.map((a: any) => [a.id, Number(a.opening_balance) || 0]));
  for (const t of transactions) {
    const v = Number(t.amount);
    balances[t.account_id] = (balances[t.account_id] ?? 0) + (t.kind === "income" || t.kind === "divest" ? v : -v);
    if (t.kind === "transfer" && t.to_account_id) balances[t.to_account_id] = (balances[t.to_account_id] ?? 0) + Number(t.to_amount ?? t.amount);
  }
  const loanLeft = (l: any) => {
    const sch = schedule(l);
    const paid = new Set(loanPayments.filter((p: any) => p.loan_id === l.id).map((p: any) => p.n));
    for (let i = 1; i <= (l.paid_before || 0); i++) paid.add(i);
    const next = sch.find((x) => !paid.has(x.n));
    return next ? (sch[next.n - 2]?.balance ?? Number(l.principal)) : 0;
  };
  return { family, members, accounts, categories, transactions, loans, investments, debts, goals, recurring, rates, accById, catById, memById, toMdl, txCur, balances, loanLeft };
}

// ───────── Telegram: trimite fișier ─────────
async function sendFile(chatId: number, bytes: Uint8Array, filename: string, mime: string, caption: string) {
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("caption", caption);
  fd.append("document", new Blob([bytes], { type: mime }), filename);
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: "POST", body: fd });
  return r.ok;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "export" ? "export" : "report";

  // Programat: toată lumea abonată
  if (url.searchParams.get("all") === "1") {
    if (req.headers.get("x-cron-secret") !== (await derivedSecret(BOT_TOKEN, "cron"))) return json({ error: "forbidden" }, 403);
    const today = todayLocal();
    const [y, m] = today.split("-").map(Number);
    const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    const { data: fams } = await db.from("families").select("id");
    let sent = 0;
    for (const fam of fams ?? []) {
      const { data: mem } = await db.from("members").select("telegram_id, lang, notify").eq("family_id", fam.id).in("role", ["owner", "editor"]).not("telegram_id", "is", null);
      const want = (mem ?? []).filter((x: any) => type === "report" ? x.notify?.monthly !== false : x.notify?.backup === true);
      if (!want.length) continue;
      const F = await loadFamily(fam.id);
      if (type === "report" && !F.transactions.some((t: any) => t.date.startsWith(prevMonth))) continue;
      for (const x of want) {
        const lang = x.lang === "ru" ? "ru" : "ro";
        if (type === "report") { const r = await buildReport(F, prevMonth, lang); if (await sendFile(x.telegram_id, r.bytes, r.name, "application/pdf", L[lang].caption(r.monthLabel))) sent++; }
        else { const r = buildExport(F, lang); if (await sendFile(x.telegram_id, r.bytes, r.name, XLSX_MIME, L[lang].exportCap)) sent++; }
      }
    }
    return json({ ok: true, sent });
  }

  // Din aplicație: utilizatorul autentificat
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: me } = await db.from("members").select("family_id, telegram_id, lang, role").eq("user_id", u.user.id).in("role", ["owner", "editor"]).maybeSingle();
  if (!me?.telegram_id) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const lang = me.lang === "ru" ? "ru" : "ro";
  const F = await loadFamily(me.family_id);
  try {
    if (type === "report") {
      const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : todayLocal().slice(0, 7);
      const r = await buildReport(F, month, lang);
      return json({ ok: await sendFile(me.telegram_id, r.bytes, r.name, "application/pdf", L[lang].caption(r.monthLabel)) });
    }
    const r = buildExport(F, lang);
    return json({ ok: await sendFile(me.telegram_id, r.bytes, r.name, XLSX_MIME, L[lang].exportCap) });
  } catch (e) {
    console.error(e);
    return json({ error: "build_failed" }, 500);
  }
});
