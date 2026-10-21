// Notificări programate (rulate zilnic și săptămânal din GitHub Actions) + actualizare curs BNM.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { derivedSecret, tg } from "../_shared/telegram.ts";
import { nextUnpaid } from "../_shared/loan.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Data de azi în Chișinău
function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
const fmt = (n: number) =>
  new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\./g, " ");

const T = {
  ro: {
    open: "Deschide",
    loan: (name: string, amt: string, cur: string, d: number, date: string) =>
      d === 0 ? `🏦 Azi e scadența ratei „${name}”: ${amt} ${cur}.` : `🏦 Rata „${name}” de ${amt} ${cur} e scadentă peste ${d} zile, pe ${date}.`,
    car: (title: string, d: number, date: string) => `🚗 ${title} expiră peste ${d} ${d === 1 ? "zi" : "zile"}, pe ${date}.`,
    b80: (cat: string, left: string) => `⚠️ Bugetul „${cat}” e consumat 80%. Mai ai ${left} MDL luna asta.`,
    b100: (cat: string, over: string) => `⛔ Bugetul „${cat}” e depășit cu ${over} MDL.`,
    weekly: (inc: string, exp: string, top: string, bal: string) =>
      `📊 Săptămâna aceasta\nVenituri: +${inc} MDL\nCheltuieli: −${exp} MDL\n${top ? `Cele mai mari: ${top}\n` : ""}Sold total: ${bal} MDL`,
  },
  ru: {
    open: "Открыть",
    loan: (name: string, amt: string, cur: string, d: number, date: string) =>
      d === 0 ? `🏦 Сегодня платёж по «${name}»: ${amt} ${cur}.` : `🏦 Платёж по «${name}» ${amt} ${cur} через ${d} дн., ${date}.`,
    car: (title: string, d: number, date: string) => `🚗 ${title} истекает через ${d} дн., ${date}.`,
    b80: (cat: string, left: string) => `⚠️ Бюджет «${cat}» использован на 80%. Осталось ${left} MDL.`,
    b100: (cat: string, over: string) => `⛔ Бюджет «${cat}» превышен на ${over} MDL.`,
    weekly: (inc: string, exp: string, top: string, bal: string) =>
      `📊 За неделю\nДоходы: +${inc} MDL\nРасходы: −${exp} MDL\n${top ? `Больше всего: ${top}\n` : ""}Общий баланс: ${bal} MDL`,
  },
};

type Member = { telegram_id: number; lang: "ro" | "ru"; notify: Record<string, boolean> };

async function once(key: string): Promise<boolean> {
  const { error } = await db.from("notify_log").insert({ key });
  return !error; // duplicat = deja trimis
}

async function send(members: Member[], kind: string, text: (lang: "ro" | "ru") => string) {
  for (const m of members) {
    if (m.notify?.[kind] === false) continue;
    const t = T[m.lang] ?? T.ro;
    await tg(BOT_TOKEN, "sendMessage", {
      chat_id: m.telegram_id,
      text: text(m.lang),
      reply_markup: { inline_keyboard: [[{ text: t.open, web_app: { url: APP_URL } }]] },
    });
  }
}

async function refreshRates(today: string) {
  const [y, m, d] = today.split("-");
  try {
    const r = await fetch(`https://www.bnm.md/en/official_exchange_rates?get_xml=1&date=${d}.${m}.${y}`);
    const xml = await r.text();
    for (const cur of ["EUR", "USD"]) {
      const block = xml.match(new RegExp(`<Valute[^>]*>(?:(?!</Valute>)[\\s\\S])*<CharCode>${cur}</CharCode>(?:(?!</Valute>)[\\s\\S])*</Valute>`));
      if (!block) continue;
      const nominal = Number(block[0].match(/<Nominal>([\d.,]+)<\/Nominal>/)?.[1]?.replace(",", ".") ?? 1);
      const value = Number(block[0].match(/<Value>([\d.,]+)<\/Value>/)?.[1]?.replace(",", "."));
      if (value > 0) await db.from("rates").upsert({ currency: cur, date: today, rate: value / nominal });
    }
  } catch (_) { /* cursul rămâne cel de ieri */ }
}

async function latestRates(): Promise<Record<string, number>> {
  const out: Record<string, number> = { MDL: 1 };
  for (const cur of ["EUR", "USD"]) {
    const { data } = await db.from("rates").select("rate").eq("currency", cur).order("date", { ascending: false }).limit(1);
    if (data?.[0]) out[cur] = Number(data[0].rate);
  }
  return out;
}

async function daily(today: string) {
  await refreshRates(today);
  const rates = await latestRates();
  const toMdl = (a: number, cur: string) => a * (rates[cur] ?? 1);
  const month = today.slice(0, 7);

  const { data: families } = await db.from("families").select("id");
  for (const f of families ?? []) {
    const { data: mem } = await db.from("members").select("telegram_id, lang, notify")
      .eq("family_id", f.id).in("role", ["owner", "editor"]).not("telegram_id", "is", null);
    const members = (mem ?? []) as Member[];
    if (!members.length) continue;

    // Credite
    const { data: loans } = await db.from("loans").select("*").eq("family_id", f.id).eq("closed", false);
    for (const l of loans ?? []) {
      const { data: pays } = await db.from("loan_payments").select("n").eq("loan_id", l.id);
      const next = nextUnpaid(l, (pays ?? []).map((p) => p.n));
      if (!next) continue;
      const d = daysBetween(today, next.due);
      if ((d === 3 || d === 0) && (await once(`loan:${l.id}:${next.n}:${d}`))) {
        await send(members, "loans", (lg) => T[lg].loan(l.name, fmt(next.payment), l.currency, d, next.due.split("-").reverse().join(".")));
      }
    }

    // Mașina: asigurări și revizie
    const { data: evs } = await db.from("car_events").select("*").eq("family_id", f.id).eq("done", false).not("due_date", "is", null);
    for (const e of evs ?? []) {
      const d = daysBetween(today, e.due_date);
      if ([30, 7, 1].includes(d) && (await once(`car:${e.id}:${d}`))) {
        await send(members, "car", (lg) => T[lg].car(e.title, d, e.due_date.split("-").reverse().join(".")));
      }
    }

    // Bugete
    const { data: cats } = await db.from("categories").select("id, name_ro, name_ru, budget")
      .eq("family_id", f.id).eq("kind", "expense").not("budget", "is", null);
    if (cats?.length) {
      const { data: txs } = await db.from("transactions").select("amount, category_id, account_id, accounts!transactions_account_id_fkey(currency)")
        .eq("family_id", f.id).eq("kind", "expense").gte("date", `${month}-01`).lte("date", today);
      const spent: Record<string, number> = {};
      for (const t of txs ?? []) {
        // deno-lint-ignore no-explicit-any
        const cur = (t as any).accounts?.currency ?? "MDL";
        if (t.category_id) spent[t.category_id] = (spent[t.category_id] ?? 0) + toMdl(Number(t.amount), cur);
      }
      for (const c of cats) {
        const s = spent[c.id] ?? 0, b = Number(c.budget);
        if (b <= 0) continue;
        if (s > b && (await once(`budget:${c.id}:${month}:100`))) {
          await send(members, "budget", (lg) => T[lg].b100(lg === "ru" ? c.name_ru : c.name_ro, fmt(s - b)));
        } else if (s >= 0.8 * b && s <= b && (await once(`budget:${c.id}:${month}:80`))) {
          await send(members, "budget", (lg) => T[lg].b80(lg === "ru" ? c.name_ru : c.name_ro, fmt(b - s)));
        }
      }
    }
  }
}

async function weekly(today: string) {
  const rates = await latestRates();
  const toMdl = (a: number, cur: string) => a * (rates[cur] ?? 1);
  const from = new Date(Date.parse(today) - 6 * 86400000).toISOString().slice(0, 10);
  const { data: families } = await db.from("families").select("id");
  for (const f of families ?? []) {
    if (!(await once(`weekly:${f.id}:${today}`))) continue;
    const { data: mem } = await db.from("members").select("telegram_id, lang, notify")
      .eq("family_id", f.id).in("role", ["owner", "editor"]).not("telegram_id", "is", null);
    const members = (mem ?? []) as Member[];
    if (!members.length) continue;

    const { data: txs } = await db.from("transactions").select("kind, amount, category_id, accounts!transactions_account_id_fkey(currency), categories(name_ro, name_ru)")
      .eq("family_id", f.id).gte("date", from).lte("date", today).neq("kind", "transfer");
    let inc = 0, exp = 0;
    const byCat: Record<string, { ro: string; ru: string; v: number }> = {};
    // deno-lint-ignore no-explicit-any
    for (const t of (txs ?? []) as any[]) {
      const v = toMdl(Number(t.amount), t.accounts?.currency ?? "MDL");
      if (t.kind === "income") inc += v;
      else {
        exp += v;
        const k = t.category_id ?? "-";
        byCat[k] ??= { ro: t.categories?.name_ro ?? "Altele", ru: t.categories?.name_ru ?? "Другое", v: 0 };
        byCat[k].v += v;
      }
    }
    const top = Object.values(byCat).sort((a, b) => b.v - a.v).slice(0, 3);

    const { data: accs } = await db.from("accounts").select("id, currency").eq("family_id", f.id).eq("archived", false);
    const { data: bals } = await db.from("account_balances").select("account_id, balance").in("account_id", (accs ?? []).map((a) => a.id));
    const curOf = Object.fromEntries((accs ?? []).map((a) => [a.id, a.currency]));
    const total = (bals ?? []).reduce((s, b) => s + toMdl(Number(b.balance), curOf[b.account_id]), 0);

    await send(members, "weekly", (lg) =>
      T[lg].weekly(fmt(inc), fmt(exp), top.map((c) => `${lg === "ru" ? c.ru : c.ro} ${fmt(c.v)}`).join(", "), fmt(total)));
  }
}

Deno.serve(async (req) => {
  const expected = await derivedSecret(BOT_TOKEN, "cron");
  if (req.headers.get("x-cron-secret") !== expected) return new Response("forbidden", { status: 403 });
  const task = new URL(req.url).searchParams.get("task") ?? "daily";
  const today = todayLocal();
  if (task === "weekly") await weekly(today);
  else await daily(today);
  return new Response(JSON.stringify({ ok: true, task, today }), { headers: { "content-type": "application/json" } });
});
