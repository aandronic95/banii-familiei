// Notificări programate (rulate zilnic și săptămânal din GitHub Actions) + actualizare curs BNM.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { derivedSecret, tg } from "../_shared/telegram.ts";
import { nextOccurrence, nextUnpaid } from "../_shared/loan.ts";
import { ratesFor } from "../_shared/bnm.ts";

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
    recAdded: (name: string, sign: string, amt: string, cur: string) => `🔁 Am adăugat plata recurentă „${name}”: ${sign}${amt} ${cur}.`,
    recSoon: (name: string, sign: string, amt: string, cur: string) => `🔔 Mâine: „${name}” ${sign}${amt} ${cur}.`,
    debtDue: (who: string, dir: string, amt: string, cur: string) => dir === "owed_to_us" ? `🤝 Azi e termenul: ${who} trebuie să vă întoarcă ${amt} ${cur}.` : `🤝 Azi e termenul: trebuie să-i întoarceți lui ${who} ${amt} ${cur}.`,
    inv: (name: string, amt: string, cur: string, d: number, date: string) =>
      d === 0 ? `📈 Azi ajunge la scadență „${name}” (${amt} ${cur}).` : `📈 „${name}” (${amt} ${cur}) ajunge la scadență peste ${d} zile, pe ${date}.`,
    b80: (cat: string, left: string) => `⚠️ Bugetul „${cat}” e consumat 80%. Mai ai ${left} MDL luna asta.`,
    b100: (cat: string, over: string) => `⛔ Bugetul „${cat}” e depășit cu ${over} MDL.`,
    weekly: (inc: string, exp: string, top: string, bal: string) =>
      `📊 Săptămâna aceasta\nVenituri: +${inc} MDL\nCheltuieli: −${exp} MDL\n${top ? `Cele mai mari: ${top}\n` : ""}Sold total: ${bal} MDL`,
    mHead: (m: string) => `🗓 Concluzia lunii ${m}`, mInc: "Venituri", mExp: "Cheltuieli", mSaved: "Economisit", mRate: (p: number) => `${p}% din venituri`,
    mAvg: "Pe zi", mTop: "Unde s-au dus banii:", mUp: (c: string, p: number) => `📈 Cel mai mult a crescut: ${c} (+${p}%)`, mDown: (c: string, p: number) => `📉 Ați redus: ${c} (−${p}%)`,
    mVs: "față de luna trecută", mNone: "Nicio tranzacție luna trecută.",
  },
  ru: {
    open: "Открыть",
    loan: (name: string, amt: string, cur: string, d: number, date: string) =>
      d === 0 ? `🏦 Сегодня платёж по «${name}»: ${amt} ${cur}.` : `🏦 Платёж по «${name}» ${amt} ${cur} через ${d} дн., ${date}.`,
    car: (title: string, d: number, date: string) => `🚗 ${title} истекает через ${d} дн., ${date}.`,
    recAdded: (name: string, sign: string, amt: string, cur: string) => `🔁 Добавлен регулярный платёж «${name}»: ${sign}${amt} ${cur}.`,
    recSoon: (name: string, sign: string, amt: string, cur: string) => `🔔 Завтра: «${name}» ${sign}${amt} ${cur}.`,
    debtDue: (who: string, dir: string, amt: string, cur: string) => dir === "owed_to_us" ? `🤝 Сегодня срок: ${who} должен вернуть ${amt} ${cur}.` : `🤝 Сегодня срок: нужно вернуть ${who} ${amt} ${cur}.`,
    inv: (name: string, amt: string, cur: string, d: number, date: string) =>
      d === 0 ? `📈 Сегодня погашение «${name}» (${amt} ${cur}).` : `📈 «${name}» (${amt} ${cur}): погашение через ${d} дн., ${date}.`,
    b80: (cat: string, left: string) => `⚠️ Бюджет «${cat}» использован на 80%. Осталось ${left} MDL.`,
    b100: (cat: string, over: string) => `⛔ Бюджет «${cat}» превышен на ${over} MDL.`,
    weekly: (inc: string, exp: string, top: string, bal: string) =>
      `📊 За неделю\nДоходы: +${inc} MDL\nРасходы: −${exp} MDL\n${top ? `Больше всего: ${top}\n` : ""}Общий баланс: ${bal} MDL`,
    mHead: (m: string) => `🗓 Итоги месяца: ${m}`, mInc: "Доходы", mExp: "Расходы", mSaved: "Сэкономлено", mRate: (p: number) => `${p}% от доходов`,
    mAvg: "В день", mTop: "Куда ушли деньги:", mUp: (c: string, p: number) => `📈 Больше всего выросло: ${c} (+${p}%)`, mDown: (c: string, p: number) => `📉 Сократили: ${c} (−${p}%)`,
    mVs: "к прошлому месяцу", mNone: "За прошлый месяц операций нет.",
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
  await ratesFor(db, today);
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

    // Plăți recurente: se adaugă în ziua lor (recuperează și zilele ratate), anunț cu o zi înainte
    const { data: recs } = await db.from("recurring").select("*").eq("family_id", f.id).eq("active", true);
    const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
    const { data: famAccs } = await db.from("accounts").select("id, currency, type, archived").eq("family_id", f.id);
    const firstAcc = (famAccs ?? []).find((a) => !a.archived && a.type === "card") ?? (famAccs ?? []).find((a) => !a.archived);
    for (const r of recs ?? []) {
      const acc = (famAccs ?? []).find((a) => a.id === r.account_id) ?? firstAcc;
      const sign = r.kind === "income" ? "+" : "−";
      if (r.remind && r.next_date === tomorrow && (await once(`rec-soon:${r.id}:${r.next_date}`))) {
        await send(members, "recurring", (lg) => T[lg].recSoon(r.name, sign, fmt(Number(r.amount)), acc?.currency ?? "MDL"));
      }
      let next = r.next_date, guard = 0;
      while (r.auto_add && acc && next <= today && guard++ < 6) {
        if (await once(`rec:${r.id}:${next}`)) {
          await db.from("transactions").insert({
            family_id: f.id, kind: r.kind, amount: r.amount, account_id: acc.id, category_id: r.category_id,
            member_id: r.member_id, date: next, merchant: r.name, note: "Plată recurentă", recurring_id: r.id,
          });
          await send(members, "recurring", (lg) => T[lg].recAdded(r.name, sign, fmt(Number(r.amount)), acc.currency));
        }
        next = nextOccurrence(next, r.every_months, r.day_of_month);
      }
      if (next !== r.next_date) await db.from("recurring").update({ next_date: next }).eq("id", r.id);
    }

    // Datorii personale: memento în ziua termenului
    const { data: debts } = await db.from("debts").select("*").eq("family_id", f.id).eq("settled", false).eq("due_date", today);
    for (const d of debts ?? []) {
      if (await once(`debt:${d.id}:${today}`)) {
        await send(members, "debts", (lg) => T[lg].debtDue(d.person, d.direction, fmt(Number(d.amount) - Number(d.paid)), d.currency));
      }
    }

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

    // Investiții: scadențe
    const { data: invs } = await db.from("investments").select("id, name, code, amount, currency, maturity_date")
      .eq("family_id", f.id).neq("status", "closed").not("maturity_date", "is", null);
    for (const i of invs ?? []) {
      const d = daysBetween(today, i.maturity_date);
      if ((d === 7 || d === 0) && (await once(`inv:${i.id}:${d}`))) {
        const label = i.code ? `${i.name} ${i.code}` : i.name;
        await send(members, "invest", (lg) => T[lg].inv(label, fmt(Number(i.amount)), i.currency, d, i.maturity_date.split("-").reverse().join(".")));
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

// Pe 1 ale lunii: concluzia lunii trecute (unde s-au dus banii, ce a crescut, cât ați economisit)
const MONTHS = {
  ro: ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"],
  ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
};
function monthBounds(y: number, m: number): [string, string, number] {
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, "0");
  return [`${y}-${mm}-01`, `${y}-${mm}-${String(last).padStart(2, "0")}`, last];
}
export function monthSummary(txs: any[], toMdl: (a: number, c: string) => number, from: string, to: string) {
  let inc = 0, exp = 0;
  const byCat: Record<string, { ro: string; ru: string; v: number }> = {};
  for (const t of txs) {
    if (t.date < from || t.date > to || (t.kind !== "income" && t.kind !== "expense")) continue;
    const v = toMdl(Number(t.amount), t.accounts?.currency ?? "MDL");
    if (t.kind === "income") { inc += v; continue; }
    exp += v;
    const k = t.category_id ?? "-";
    byCat[k] ??= { ro: t.categories?.name_ro ?? "Altele", ru: t.categories?.name_ru ?? "Другое", v: 0 };
    byCat[k].v += v;
  }
  return { inc, exp, byCat };
}

async function monthly(today: string) {
  const rates = await latestRates();
  const toMdl = (a: number, cur: string) => a * (rates[cur] ?? 1);
  const [ty, tm] = today.split("-").map(Number);
  const pm = new Date(Date.UTC(ty, tm - 2, 1)), ppm = new Date(Date.UTC(ty, tm - 3, 1));
  const [from, to, days] = monthBounds(pm.getUTCFullYear(), pm.getUTCMonth());
  const [pfrom, pto, pdays] = monthBounds(ppm.getUTCFullYear(), ppm.getUTCMonth());
  const { data: families } = await db.from("families").select("id");
  for (const f of families ?? []) {
    if (!(await once(`monthsum:${f.id}:${from}`))) continue;
    const { data: mem } = await db.from("members").select("telegram_id, lang, notify")
      .eq("family_id", f.id).in("role", ["owner", "editor"]).not("telegram_id", "is", null);
    const members = (mem ?? []) as Member[];
    if (!members.length) continue;
    const { data: txs } = await db.from("transactions").select("kind, amount, date, category_id, accounts!transactions_account_id_fkey(currency), categories(name_ro, name_ru)")
      .eq("family_id", f.id).gte("date", pfrom).lte("date", to).in("kind", ["income", "expense"]);
    const cur = monthSummary(txs ?? [], toMdl, from, to);
    const prev = monthSummary(txs ?? [], toMdl, pfrom, pto);
    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

    await send(members, "monthly", (lg) => {
      const L = T[lg];
      const head = L.mHead(`${MONTHS[lg][pm.getUTCMonth()]} ${pm.getUTCFullYear()}`);
      if (!cur.inc && !cur.exp) return `${head}\n${L.mNone}`;
      const d = pct(cur.exp, prev.exp);
      const vs = d === null ? "" : ` (${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}% ${L.mVs})`;
      const saved = cur.inc - cur.exp;
      const lines = [
        head,
        `${L.mInc}: +${fmt(cur.inc)} MDL`,
        `${L.mExp}: −${fmt(cur.exp)} MDL${vs}`,
        `${L.mSaved}: ${saved >= 0 ? "+" : "−"}${fmt(Math.abs(saved))} MDL` + (cur.inc > 0 ? ` · ${L.mRate(Math.round((saved / cur.inc) * 100))}` : ""),
        `${L.mAvg}: ${fmt(cur.exp / days)} MDL` + (prev.exp ? ` (${fmt(prev.exp / pdays)} ${lg === "ru" ? "раньше" : "înainte"})` : ""),
      ];
      const top = Object.entries(cur.byCat).sort((a, b) => b[1].v - a[1].v).slice(0, 3);
      if (top.length) {
        lines.push("", L.mTop);
        for (const [k, c] of top) {
          const p = pct(c.v, prev.byCat[k]?.v ?? 0);
          lines.push(`• ${lg === "ru" ? c.ru : c.ro}: ${fmt(c.v)} MDL · ${Math.round((c.v / cur.exp) * 100)}%` + (p === null ? "" : ` (${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}%)`));
        }
      }
      // Cea mai mare creștere și cea mai mare reducere (doar sume care contează, peste 300 MDL)
      const ch = Object.keys({ ...cur.byCat, ...prev.byCat }).map((k) => {
        const a = cur.byCat[k]?.v ?? 0, b = prev.byCat[k]?.v ?? 0;
        const c = cur.byCat[k] ?? prev.byCat[k];
        return { name: lg === "ru" ? c.ru : c.ro, diff: a - b, p: pct(a, b) };
      }).filter((x) => x.p !== null && Math.abs(x.diff) >= 300);
      const up = ch.filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff)[0];
      const down = ch.filter((x) => x.diff < 0).sort((a, b) => a.diff - b.diff)[0];
      if (up || down) lines.push("");
      if (up) lines.push(L.mUp(up.name, up.p!));
      if (down) lines.push(L.mDown(down.name, Math.abs(down.p!)));
      return lines.join("\n");
    });
  }
}

Deno.serve(async (req) => {
  const expected = await derivedSecret(BOT_TOKEN, "cron");
  if (req.headers.get("x-cron-secret") !== expected) return new Response("forbidden", { status: 403 });
  const task = new URL(req.url).searchParams.get("task") ?? "daily";
  const today = todayLocal();
  if (task === "weekly") await weekly(today);
  else if (task === "monthly") await monthly(today);
  else {
    await daily(today);
    // Istoricul modificărilor se păstrează un an
    await db.from("audit_log").delete().lt("at", new Date(Date.now() - 365 * 86400000).toISOString());
  }
  return new Response(JSON.stringify({ ok: true, task, today }), { headers: { "content-type": "application/json" } });
});
