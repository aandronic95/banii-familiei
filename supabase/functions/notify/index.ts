// deno-lint-ignore-file no-explicit-any
// Notificări programate (rulate zilnic și săptămânal din GitHub Actions) + actualizare curs BNM.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { derivedSecret, tg } from "../_shared/telegram.ts";
import { loanForRecurring, nextOccurrence, nextUnpaid, schedule } from "../_shared/loan.ts";
import { isSalaryTx, salaryPlan } from "../_shared/salary.ts";
import { ratesFor } from "../_shared/bnm.ts";
import { weeklyText, type WeekTx } from "../_shared/weekly.ts";
import { advance, askKeyboard, dueDate, RT } from "../_shared/recurring.ts";
import { addPayout, convert, payKeyboard, PT } from "../_shared/payouts.ts";
import { behindText, type Commit, newCommits, releaseText, UPSTREAM } from "../_shared/release.ts";
import { AT, lowBalance, paceAlerts } from "../_shared/alerts2.ts";
import { allowanceDue } from "../_shared/allowance.ts";
import { accruedInterest, couponDates, duePayouts } from "../_shared/invest.ts";
import { nextEventDate, turning } from "../_shared/home.ts";
import { nowLocalHM, taskButtons, taskLine, T as TT } from "../_shared/tasks.ts";

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
const fmt2 = (n: number) => n.toFixed(2).replace(".", ",");
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
    ev: (title: string, d: number, turns: number | null, gift: string | null) =>
      `${d === 0 ? "🎉 Azi" : `🎂 Peste ${d} ${d === 1 ? "zi" : "zile"}`}: ${title}${turns ? ` împlinește ${turns} ani` : ""}.${gift ? ` Buget de cadou: ${gift} MDL.` : ""}`,
    meters: (names: string) => `🔢 E ziua indicilor la contoare: ${names}. Scrie-i în aplicație ca să vezi consumul și costul.`,
    coupon: (n: string, a: string, c: string) => `💰 Azi se plătește dobânda pentru „${n}”: ~${a} ${c}. Când ajunge pe card, apasă „Deschide” → investiția → „Încasează dobândă / cupon”.`,
    mHead: (m: string) => `🗓 Concluzia lunii ${m}`, mInc: "Venituri", mExp: "Cheltuieli", mSaved: "Economisit", mRate: (p: number) => `${p}% din venituri`,
    mAvg: "Pe zi", mTop: "Unde s-au dus banii:", mUp: (c: string, p: number) => `📈 Cel mai mult a crescut: ${c} (+${p}%)`, mDown: (c: string, p: number) => `📉 Ați redus: ${c} (−${p}%)`,
    mVs: "față de luna trecută", mNone: "Nicio tranzacție luna trecută.",
    fx: (cur: string, op: string, lim: string, now: string, prev: string) => `💱 ${cur} a trecut ${op === "<" ? "sub" : "peste"} ${lim}: azi 1 ${cur} = ${now} MDL (ieri ${prev}).`,
    eHead: "🌙 Ziua de azi", eSpent: (a: string, n: number) => `Cheltuit: −${a} MDL (${n} ${n === 1 ? "plată" : "plăți"})`, eNone: "Azi nicio cheltuială 👍", eInc: (a: string) => `Venit: +${a} MDL`,
    eBudget: (left: string, total: string) => `Bugetul lunii: rămas ${left} din ${total} MDL`, eOver: (a: string) => `Bugetul lunii e depășit cu ${a} MDL`,
    ePerDay: (a: string, d: number) => `Poți cheltui ~${a} MDL pe zi în următoarele ${d} ${d === 1 ? "zi" : "zile"}`, eMonth: (a: string) => `Luna aceasta: −${a} MDL`,
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
    ev: (title: string, d: number, turns: number | null, gift: string | null) =>
      `${d === 0 ? "🎉 Сегодня" : `🎂 Через ${d} дн.`}: ${title}${turns ? ` — исполняется ${turns}` : ""}.${gift ? ` Бюджет на подарок: ${gift} MDL.` : ""}`,
    meters: (names: string) => `🔢 День передачи показаний: ${names}. Внесите их в приложении, чтобы увидеть расход и стоимость.`,
    coupon: (n: string, a: string, c: string) => `💰 Сегодня выплата процентов по «${n}»: ~${a} ${c}. Когда придут на карту, откройте инвестицию → «Получить проценты / купон».`,
    mHead: (m: string) => `🗓 Итоги месяца: ${m}`, mInc: "Доходы", mExp: "Расходы", mSaved: "Сэкономлено", mRate: (p: number) => `${p}% от доходов`,
    mAvg: "В день", mTop: "Куда ушли деньги:", mUp: (c: string, p: number) => `📈 Больше всего выросло: ${c} (+${p}%)`, mDown: (c: string, p: number) => `📉 Сократили: ${c} (−${p}%)`,
    mVs: "к прошлому месяцу", mNone: "За прошлый месяц операций нет.",
    fx: (cur: string, op: string, lim: string, now: string, prev: string) => `💱 ${cur} ${op === "<" ? "опустился ниже" : "поднялся выше"} ${lim}: сегодня 1 ${cur} = ${now} MDL (вчера ${prev}).`,
    eHead: "🌙 Итоги дня", eSpent: (a: string, n: number) => `Потрачено: −${a} MDL (${n} опер.)`, eNone: "Сегодня без расходов 👍", eInc: (a: string) => `Доход: +${a} MDL`,
    eBudget: (left: string, total: string) => `Бюджет месяца: осталось ${left} из ${total} MDL`, eOver: (a: string) => `Бюджет месяца превышен на ${a} MDL`,
    ePerDay: (a: string, d: number) => `Можно тратить ~${a} MDL в день ещё ${d} дн.`, eMonth: (a: string) => `За месяц: −${a} MDL`,
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
  for (const cur of ["EUR", "USD", "RON"]) {
    const { data } = await db.from("rates").select("rate").eq("currency", cur).order("date", { ascending: false }).limit(1);
    if (data?.[0]) out[cur] = Number(data[0].rate);
  }
  return out;
}

// ───────────── Versiunea nouă ─────────────
async function meta(key: string) {
  const { data } = await db.from("app_meta").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? null) as Record<string, unknown> | null;
}
const setMeta = (key: string, value: unknown) => db.from("app_meta").upsert({ key, value, updated_at: new Date().toISOString() });
// deno-lint-ignore no-explicit-any
async function allMembers(): Promise<any[]> {
  const { data } = await db.from("members").select("telegram_id, lang, notify, role").in("role", ["owner", "editor"]).not("telegram_id", "is", null);
  return data ?? [];
}
// deno-lint-ignore no-explicit-any
async function release(body: any) {
  const commits = (Array.isArray(body?.commits) ? body.commits : []).filter((c: Commit) => c?.sha && c?.title).slice(0, 60) as Commit[];
  const sha = String(body?.sha ?? commits[0]?.sha ?? "");
  if (!sha) return { sent: 0 };
  const cur = (await meta("release")) ?? {};
  const fresh = newCommits(commits, (cur.announced as string) ?? null);
  // ce n-a fost încă anunțat se adună, ca să nu trimitem un mesaj la fiecare mică publicare
  const pending = [...fresh, ...((cur.pending as Commit[]) ?? [])].filter((c, i, a) => a.findIndex((x) => x.sha === c.sha) === i).slice(0, 12);
  const lastSent = Date.parse(String(cur.sent_at ?? 0)) || 0;
  const next = { ...cur, sha, repo: body?.repo ?? cur.repo ?? null, date: body?.date ?? null, announced: sha, pending };
  if (!pending.length || Date.now() - lastSent < 6 * 3600000) { await setMeta("release", next); return { sent: 0, pending: pending.length }; }
  let sent = 0;
  for (const m of await allMembers()) {
    if (m.notify?.updates === false) continue;
    await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: releaseText(pending, m.lang === "ru" ? "ru" : "ro"), reply_markup: { inline_keyboard: [[{ text: (m.lang === "ru" ? T.ru : T.ro).open, web_app: { url: APP_URL } }]] } });
    sent++;
  }
  await setMeta("release", { ...next, pending: [], sent_at: new Date().toISOString() });
  return { sent };
}
// Zilnic: ce a rămas neanunțat pleacă acum; copiile rămase în urmă cu peste o zi primesc îndemnul să se actualizeze
async function releaseDaily(today: string) {
  const cur = (await meta("release")) ?? {};
  const pending = (cur.pending as Commit[]) ?? [];
  if (pending.length) {
    for (const m of await allMembers()) {
      if (m.notify?.updates === false) continue;
      await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: releaseText(pending, m.lang === "ru" ? "ru" : "ro") });
    }
    await setMeta("release", { ...cur, pending: [], sent_at: new Date().toISOString() });
  }
  const repo = String(cur.repo ?? "");
  if (!repo || repo.toLowerCase() === UPSTREAM || !cur.sha) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${UPSTREAM}/commits/main`, { headers: { accept: "application/vnd.github+json", "user-agent": "banii-familiei-notify" } });
    if (!r.ok) return;
    const c = await r.json();
    const upSha = String(c?.sha ?? ""), upDate = Date.parse(c?.commit?.committer?.date ?? "");
    const mine = String(cur.sha);
    if (!upSha || upSha.startsWith(mine) || mine.startsWith(upSha)) return;
    // după 24 de ore: actualizarea automată (dacă e pornită) ar fi avut timp să o ia
    if (!(Date.now() - upDate > 24 * 3600000)) return;
    if (!(await once(`behind:${upSha}`))) return;
    const { data: owners } = await db.from("members").select("telegram_id, lang, notify").eq("role", "owner").not("telegram_id", "is", null);
    for (const m of owners ?? []) {
      if (m.notify?.updates === false) continue;
      await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: behindText(m.lang === "ru" ? "ru" : "ro", repo) });
    }
  } catch (_) { /* GitHub indisponibil: încercăm mâine */ }
  void today;
}

async function daily(today: string) {
  await refreshRates(today);
  await releaseDaily(today).catch((e) => console.error("versiune", e));
  await salaryNotice(today).catch((e) => console.error("salariu", e));
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
    const { data: famAccs } = await db.from("accounts").select("id, name, currency, type, archived").eq("family_id", f.id);
    const firstAcc = (famAccs ?? []).find((a) => !a.archived && a.type === "card") ?? (famAccs ?? []).find((a) => !a.archived && a.type !== "asset");
    const { data: openLoans } = await db.from("loans").select("*").eq("family_id", f.id).eq("closed", false);
    for (const r of recs ?? []) {
      // Dacă plata recurentă e de fapt rata unui credit introdus, n-o mai adăugăm (s-ar număra de două ori)
      const dupLoan = loanForRecurring(r, openLoans ?? []);
      const acc = (famAccs ?? []).find((a) => a.id === r.account_id) ?? firstAcc;
      const sign = r.kind === "income" ? "+" : "−";
      const due = dueDate(r);
      if (!dupLoan && r.remind && due === tomorrow && (await once(`rec-soon:${r.id}:${r.next_date}`))) {
        await send(members, "recurring", (lg) => T[lg].recSoon(r.name, sign, fmt(Number(r.amount)), acc?.currency ?? "MDL"));
      }
      if (r.auto_add && r.confirm) {
        // Cu confirmare: întrebăm o dată pe zi, cel mult 7 zile, până se răspunde
        const late = daysBetween(due, today);
        if (acc && !dupLoan && due <= today && late <= 7 && (await once(`recq:${r.id}:${r.next_date}:${today}`))) {
          for (const m of members) {
            if (m.notify?.recurring === false) continue;
            const lg = m.lang === "ru" ? "ru" : "ro";
            await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: RT[lg].ask(r.name, sign, fmt(Number(r.amount)), acc.currency, late), reply_markup: askKeyboard(r, lg, APP_URL) });
          }
        }
        if (dupLoan && due <= today) await advance(db, r, r.next_date);
        continue;
      }
      let next = r.next_date, guard = 0;
      while (r.auto_add && acc && dueDate(r, next) <= today && guard++ < 6) {
        if (!loanForRecurring(r, openLoans ?? [], next) && (await once(`rec:${r.id}:${next}`))) {
          await db.from("transactions").insert({
            family_id: f.id, kind: r.kind, amount: r.amount, account_id: acc.id, category_id: r.category_id,
            member_id: r.member_id, date: dueDate(r, next), merchant: r.name, note: "Plată recurentă", recurring_id: r.id,
          });
          await send(members, "recurring", (lg) => T[lg].recAdded(r.name, sign, fmt(Number(r.amount)), acc.currency));
        }
        next = nextOccurrence(next, r.every_months, r.day_of_month);
      }
      // doar memento: trecem la următoarea dată după ziua plății
      while (!r.auto_add && dueDate(r, next) < today && guard++ < 6) next = nextOccurrence(next, r.every_months, r.day_of_month);
      if (next !== r.next_date) await db.from("recurring").update({ next_date: next }).eq("id", r.id);
    }

    // Dobânzi / rate de la investiții pe contul ales (automat sau după „Da, au venit”)
    const { data: payInv } = await db.from("investments").select("*").eq("family_id", f.id).neq("status", "closed").not("payout_account_id", "is", null);
    for (const inv of payInv ?? []) {
      const acc = (famAccs ?? []).find((a) => a.id === inv.payout_account_id && !a.archived);
      if (!acc) continue;
      const due = duePayouts(inv, today);
      if (!due.length) continue;
      if (inv.payout_mode === "auto") {
        let cur = inv;
        for (const row of due.slice(0, 6)) {
          const r = await addPayout(db, cur, row, acc, rates, row.date);
          if (!r) break;
          cur = { ...cur, paid_through: row.date };
          await send(members, "invest", (lg) => PT[lg].added(inv.name, fmt2(r.total), acc.currency, acc.name ?? ""));
        }
        continue;
      }
      const row = due[0];
      const late = daysBetween(row.date, today);
      if (late <= 14 && (await once(`payq:${inv.id}:${row.date}:${today}`))) {
        const total = convert(Number(row.interest) + Number(row.principal), inv.currency, acc.currency, rates);
        for (const m of members) {
          if (m.notify?.invest === false) continue;
          const lg = m.lang === "ru" ? "ru" : "ro";
          await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: PT[lg].ask(inv.name, fmt2(total), acc.currency, acc.name ?? "", row.date.split("-").reverse().join("."), late), reply_markup: payKeyboard(inv, row.date, lg, APP_URL) });
        }
      }
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

    // Bani de buzunar: suma săptămânală intră în pușculiță (transfer de pe contul ales, dacă e unul)
    {
      const { data: alw } = await db.from("goals").select("*").eq("family_id", f.id).eq("done", false).gt("allowance", 0);
      for (const g of alw ?? []) {
        const due: string[] = allowanceDue({ amount: g.allowance, weekday: g.allowance_weekday, last: g.allowance_last }, today);
        let last = g.allowance_last as string | null, saved = Number(g.saved), added = 0;
        for (const d of due) {
          // lacăt: mutăm data doar dacă n-a mutat-o altă rulare
          let q = db.from("goals").update({ allowance_last: d }).eq("id", g.id);
          q = last ? q.eq("allowance_last", last) : q.is("allowance_last", null);
          const { data: ok } = await q.select("id");
          if (!ok?.length) break;
          last = d;
          const from = (famAccs ?? []).find((a) => a.id === g.allowance_from && !a.archived);
          const amt = Number(g.allowance);
          if (g.account_id) {
            if (from) await db.from("transactions").insert({ family_id: f.id, kind: "transfer", amount: amt, account_id: from.id, to_account_id: g.account_id, date: d, member_id: g.member_id, merchant: g.name, note: "Bani de buzunar" });
            else await db.from("transactions").insert({ family_id: f.id, kind: "income", amount: amt, account_id: g.account_id, date: d, member_id: g.member_id, merchant: g.name, note: "Bani de buzunar" });
          } else {
            saved = Math.round((saved + amt) * 100) / 100;
            await db.from("goals").update({ saved }).eq("id", g.id);
            if (from) await db.from("transactions").insert({ family_id: f.id, kind: "invest", amount: amt, account_id: from.id, date: d, member_id: g.member_id, merchant: g.name, note: "Bani de buzunar" });
          }
          added += amt;
        }
        if (added > 0) {
          let total = saved;
          if (g.account_id) { const { data: b } = await db.from("account_balances").select("balance").eq("account_id", g.account_id).maybeSingle(); total = Number(b?.balance ?? 0); }
          await send(members, "allowance", (lg) => lg === "ru"
            ? `🐷 «${g.name}»: +${fmt(added)} ${g.currency} карманных денег. В копилке: ${fmt(total)} ${g.currency}.`
            : `🐷 „${g.name}”: +${fmt(added)} ${g.currency} bani de buzunar. În pușculiță: ${fmt(total)} ${g.currency}.`);
        }
      }
    }

    // Sold mic înainte de plată: ratele și plățile recurente de mâine, față de soldul contului lor
    {
      const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
      const dues: { name: string; amount: number; accountId: string }[] = [];
      for (const r of recs ?? []) {
        if (r.kind === "expense" && r.active && r.account_id && dueDate(r) === tomorrow && !loanForRecurring(r, openLoans ?? [], r.next_date)) dues.push({ name: r.name, amount: Number(r.amount), accountId: r.account_id });
      }
      for (const l of loans ?? []) {
        if (!l.account_id) continue;
        const { data: pays } = await db.from("loan_payments").select("n").eq("loan_id", l.id);
        const nx = nextUnpaid(l, (pays ?? []).map((p) => p.n));
        if (nx && nx.due === tomorrow) dues.push({ name: l.name, amount: nx.payment, accountId: l.account_id });
      }
      if (dues.length) {
        const { data: bals } = await db.from("account_balances").select("account_id, balance").in("account_id", [...new Set(dues.map((d) => d.accountId))]);
        const balances = Object.fromEntries((bals ?? []).map((b) => [b.account_id, Number(b.balance)]));
        for (const lb of lowBalance(dues, balances)) {
          const acc = (famAccs ?? []).find((a) => a.id === lb.accountId);
          if (acc && (await once(`lowbal:${lb.accountId}:${tomorrow}`))) {
            await send(members, "lowbal", (lg) => AT[lg].low(acc.name ?? "", lb.balance, lb.total, acc.currency, lb.names));
          }
        }
      }
    }

    // Peste obișnuit la mijloc de lună: categoria care a ajuns deja la cât se cheltuie de obicei pe toată luna
    {
      const d0 = new Date(Date.parse(month + "-01") - 1);
      const from3 = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - 2, 1)).toISOString().slice(0, 10);
      const { data: ctx } = await db.from("transactions").select("amount, date, category_id, accounts!transactions_account_id_fkey(currency), categories(name_ro, name_ru)")
        .eq("family_id", f.id).eq("kind", "expense").gte("date", from3).lte("date", today).not("category_id", "is", null);
      const spent: Record<string, number> = {}, past: Record<string, number[]> = {}, names: Record<string, { ro: string; ru: string }> = {};
      const months = [0, 1, 2].map((k) => new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - k, 1)).toISOString().slice(0, 7));
      // deno-lint-ignore no-explicit-any
      for (const t of (ctx ?? []) as any[]) {
        const v = toMdl(Number(t.amount), t.accounts?.currency ?? "MDL");
        names[t.category_id] = { ro: t.categories?.name_ro ?? "", ru: t.categories?.name_ru ?? t.categories?.name_ro ?? "" };
        if (t.date.startsWith(month)) spent[t.category_id] = (spent[t.category_id] ?? 0) + v;
        else { const i = months.indexOf(t.date.slice(0, 7)); if (i >= 0) { past[t.category_id] ??= [0, 0, 0]; past[t.category_id][i] += v; } }
      }
      const day = Number(today.slice(8, 10));
      const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
      for (const p of paceAlerts(spent, past, day, dim).slice(0, 2)) {
        if (await once(`pace:${f.id}:${p.cat}:${month}`)) {
          await send(members, "pace", (lg) => AT[lg].pace(lg === "ru" ? names[p.cat].ru : names[p.cat].ro, p.spent, p.usual, p.daysLeft));
        }
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
    const { data: invs } = await db.from("investments").select("id, name, code, kind, amount, currency, rate, start_date, maturity_date, coupon_freq")
      .eq("family_id", f.id).neq("status", "closed");
    // Zile de naștere și evenimente: cu X zile înainte (cum s-a ales) și în ziua lor
    const { data: famEvents } = await db.from("events").select("id, title, date, has_year, yearly, gift_budget, remind_days").eq("family_id", f.id);
    for (const e of famEvents ?? []) {
      const nx = nextEventDate(e.date, today, e.yearly);
      if (!nx) continue;
      const d = daysBetween(today, nx);
      if (!(d === 0 || d === e.remind_days) || !(await once(`ev:${e.id}:${nx}:${d}`))) continue;
      const turns = turning(e.date, nx, e.has_year);
      await send(members, "events", (lg) => T[lg].ev(e.title, d, turns, e.gift_budget ? fmt(Number(e.gift_budget)) : null));
    }
    // Contoare: în ziua aleasă pentru indici, dacă luna asta n-au fost trecuți
    const day = Number(today.slice(8, 10));
    const { data: mtrs } = await db.from("meters").select("id, name, reminder_day").eq("family_id", f.id).eq("archived", false).eq("reminder_day", day);
    if (mtrs?.length) {
      const { data: done } = await db.from("meter_readings").select("meter_id").eq("family_id", f.id).gte("date", today.slice(0, 8) + "01");
      const todo = mtrs.filter((m) => !(done ?? []).some((r) => r.meter_id === m.id));
      if (todo.length && (await once(`meters:${f.id}:${today}`))) await send(members, "meters", (lg) => T[lg].meters(todo.map((m) => m.name).join(", ")));
    }

    // Cupoane: în ziua plății dobânzii (înainte de scadență)
    for (const i of invs ?? []) {
      if (!i.rate || !i.coupon_freq || i.coupon_freq === "maturity" || !["gov_bond", "tbill", "other"].includes(i.kind)) continue;
      const dates: string[] = couponDates(i.start_date, i.maturity_date, i.coupon_freq, today);
      const k = dates.indexOf(today);
      if (k < 0 || today === i.maturity_date || !(await once(`coupon:${i.id}:${today}`))) continue;
      const amt = accruedInterest(Number(i.amount), Number(i.rate), k ? dates[k - 1] : i.start_date, today);
      const label = i.code ? `${i.name} ${i.code}` : i.name;
      await send(members, "invest", (lg) => T[lg].coupon(label, fmt(amt), i.currency));
    }
    for (const i of invs ?? []) {
      if (!i.maturity_date) continue;
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

    const pfrom = new Date(Date.parse(today) - 13 * 86400000).toISOString().slice(0, 10);
    const { data: txs } = await db.from("transactions").select("kind, amount, date, merchant, tags, accounts!transactions_account_id_fkey(currency), categories(name_ro, name_ru)")
      .eq("family_id", f.id).gte("date", pfrom).lte("date", today).in("kind", ["income", "expense"]);
    // deno-lint-ignore no-explicit-any
    const rows: (WeekTx & { tags?: string[]; cur: string; amount: number })[] = ((txs ?? []) as any[]).map((t) => ({
      kind: t.kind, date: t.date, merchant: t.merchant, mdl: toMdl(Number(t.amount), t.accounts?.currency ?? "MDL"), amount: Number(t.amount), cur: t.accounts?.currency ?? "MDL", tags: t.tags ?? [],
      cat: t.categories ? { ro: t.categories.name_ro, ru: t.categories.name_ru } : null,
    }));
    // călătoria în desfășurare (sau încheiată săptămâna asta)
    const { data: trips } = await db.from("trips").select("name, tag, currency, budget, start_date, end_date").eq("family_id", f.id).lte("start_date", today).gte("end_date", from).limit(1);
    let trip = null;
    if (trips?.length) {
      const tr = trips[0];
      const { data: ttx } = await db.from("transactions").select("kind, amount, accounts!transactions_account_id_fkey(currency)").eq("family_id", f.id).contains("tags", [tr.tag]).in("kind", ["income", "expense"]);
      // deno-lint-ignore no-explicit-any
      const net = ((ttx ?? []) as any[]).reduce((s, t) => s + (t.kind === "expense" ? 1 : -1) * toMdl(Number(t.amount), t.accounts?.currency ?? "MDL"), 0) / (rates[tr.currency] ?? 1);
      trip = { name: tr.name, spent: `${fmt(net)} ${tr.currency}`, budget: tr.budget != null ? `${fmt(Number(tr.budget))} ${tr.currency}` : null };
    }

    const { data: accs } = await db.from("accounts").select("id, currency").eq("family_id", f.id).eq("archived", false).neq("type", "asset");
    const { data: bals } = await db.from("account_balances").select("account_id, balance").in("account_id", (accs ?? []).map((a) => a.id));
    const curOf = Object.fromEntries((accs ?? []).map((a) => [a.id, a.currency]));
    const total = (bals ?? []).reduce((s, b) => s + toMdl(Number(b.balance), curOf[b.account_id]), 0);

    const input = { from, to: today, cur: rows.filter((r) => r.date >= from), prev: rows.filter((r) => r.date < from), total, trip };
    await send(members, "weekly", (lg) => weeklyText(input, lg));

    // Verificarea cash-ului: pentru fiecare portofel, întrebăm dacă suma din aplicație e cea reală
    const { data: cashAccs } = await db.from("accounts").select("id, name, currency, member_id").eq("family_id", f.id).eq("type", "cash").eq("archived", false);
    if (cashAccs?.length) {
      const { data: bals } = await db.from("account_balances").select("account_id, balance").in("account_id", cashAccs.map((a) => a.id));
      const { data: memIds } = await db.from("members").select("id, telegram_id, lang, notify").eq("family_id", f.id).in("role", ["owner", "editor"]).not("telegram_id", "is", null);
      for (const a of cashAccs) {
        const bal = Number((bals ?? []).find((b) => b.account_id === a.id)?.balance ?? 0);
        const owner = (memIds ?? []).find((m) => m.id === a.member_id);
        for (const m of owner ? [owner] : memIds ?? []) {
          if (m.notify?.cash === false) continue;
          const lg = m.lang === "ru" ? "ru" : "ro";
          await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: AT[lg].cashAsk(a.name, bal, a.currency),
            reply_markup: { inline_keyboard: [[{ text: AT[lg].cashOk, callback_data: `cok:${a.id}` }, { text: AT[lg].cashFix, callback_data: `cfx:${a.id}` }]] } });
        }
      }
    }
  }
}

// Alertă de curs: când EUR/USD trece de pragul ales (members.prefs.fx = [{ cur, op: "<" | ">", v }])
const rate4 = (n: number) => n.toFixed(4).replace(".", ",");
async function fxAlerts(today: string) {
  const prevOf: Record<string, number> = {}, nowOf: Record<string, number> = {};
  for (const cur of ["EUR", "USD", "RON"]) {
    const { data } = await db.from("rates").select("date, rate").eq("currency", cur).lte("date", today).order("date", { ascending: false }).limit(2);
    if (data?.[0]?.date === today && data[1]) { nowOf[cur] = Number(data[0].rate); prevOf[cur] = Number(data[1].rate); }
  }
  if (!Object.keys(nowOf).length) return;
  const { data: mem } = await db.from("members").select("id, telegram_id, lang, prefs").in("role", ["owner", "editor"]).not("telegram_id", "is", null);
  for (const m of mem ?? []) {
    const rules = Array.isArray(m.prefs?.fx) ? m.prefs.fx.slice(0, 10) : [];
    for (const [i, r] of rules.entries()) {
      const now = nowOf[r.cur], prev = prevOf[r.cur], v = Number(r.v);
      if (!now || !prev || !(v > 0)) continue;
      const crossed = r.op === "<" ? prev >= v && now < v : prev <= v && now > v;
      if (!crossed || !(await once(`fx:${m.id}:${i}:${r.cur}${r.op}${v}:${today}`))) continue;
      const lg = m.lang === "ru" ? "ru" : "ro";
      await tg(BOT_TOKEN, "sendMessage", {
        chat_id: m.telegram_id, text: T[lg].fx(r.cur, r.op, rate4(v), rate4(now), rate4(prev)),
        reply_markup: { inline_keyboard: [[{ text: T[lg].open, web_app: { url: APP_URL } }]] },
      });
    }
  }
}

// Seara: cât s-a cheltuit azi și cât mai rămâne din bugetul lunii
// Rezumatul de seară vine doar între 20:30 și 23:59 ora Chișinăului; mai târziu ar fi despre ziua greșită
export const eveningWindow = (hm: string) => hm >= "20:30" && hm <= "23:59";

// ───────────── Împărțirea salariului (mesaj în bot când vine salariul) ─────────────
const SAL = {
  ro: (p: Any, until: string, names: string) => `💼 A venit salariul: +${fmt(p.salary)} lei.\n` +
    `Plăți până la ${until}: ${fmt(p.bills)}${names ? ` (${names})` : ""}\n` +
    (p.save ? `Pune deoparte ${fmt(p.save)}\n` : "") +
    (p.rest > 0 ? `Rămân ${fmt(p.rest)} → ≈ ${fmt(p.perDay)} lei pe zi, ${p.days} zile.` : `Plățile depășesc salariul cu ${fmt(p.short)} lei.`) +
    `\nÎn aplicație (Acasă) muți economiile dintr-o atingere.`,
  ru: (p: Any, until: string, names: string) => `💼 Пришла зарплата: +${fmt(p.salary)} лей.\n` +
    `Платежи до ${until}: ${fmt(p.bills)}${names ? ` (${names})` : ""}\n` +
    (p.save ? `Отложить ${fmt(p.save)}\n` : "") +
    (p.rest > 0 ? `Остаётся ${fmt(p.rest)} → ≈ ${fmt(p.perDay)} лей в день, ${p.days} дн.` : `Платежи больше зарплаты на ${fmt(p.short)} лей.`) +
    `\nВ приложении (Главная) накопления переводятся одним нажатием.`,
};
// deno-lint-ignore no-explicit-any
type Any = any;
async function salaryNotice(today: string) {
  const rates = await latestRates();
  const toMdl = (a: number, cur: string) => a * (rates[cur] ?? 1);
  const since = new Date(Date.parse(today) - 2 * 86400000).toISOString().slice(0, 10);
  const { data: families } = await db.from("families").select("id");
  for (const f of families ?? []) {
    const { data: txs } = await db.from("transactions").select("id, kind, amount, merchant, note, date, recurring_id, accounts!transactions_account_id_fkey(currency), categories(icon)")
      .eq("family_id", f.id).eq("kind", "income").gte("date", since).lte("date", today);
    const { data: recs } = await db.from("recurring").select("*").eq("family_id", f.id).eq("active", true);
    const recName = (id: string | null) => (recs ?? []).find((r) => r.id === id)?.name;
    // deno-lint-ignore no-explicit-any
    const sal = ((txs ?? []) as any[]).map((t) => ({ ...t, mdl: toMdl(Number(t.amount), t.accounts?.currency ?? "MDL") }))
      .find((t) => isSalaryTx(t, t.categories?.icon, recName(t.recurring_id)));
    if (!sal || !(await once(`salary:${sal.id}`))) continue;
    // următorul salariu: plata recurentă „salariu”, altfel peste 30 de zile
    const salRec = (recs ?? []).filter((r) => r.kind === "income" && /salar|зарплат/i.test(r.name)).map((r) => dueDate(r)).filter((d) => d > today).sort()[0];
    const until = salRec ?? new Date(Date.parse(today) + 30 * 86400000).toISOString().slice(0, 10);
    const obligations: { date: string; name: string; amount: number }[] = [];
    const { data: accs } = await db.from("accounts").select("id, currency").eq("family_id", f.id);
    const curOf = (id: string | null) => (accs ?? []).find((a) => a.id === id)?.currency ?? "MDL";
    const { data: loans } = await db.from("loans").select("*").eq("family_id", f.id).eq("closed", false);
    for (const r of recs ?? []) {
      if (r.kind !== "expense") continue;
      let d = r.next_date, g = 0;
      while (dueDate(r, d) < until && g++ < 40) {
        if (dueDate(r, d) >= today && !loanForRecurring(r, loans ?? [], d)) obligations.push({ date: dueDate(r, d), name: r.name, amount: toMdl(Number(r.amount), curOf(r.account_id)) });
        d = nextOccurrence(d, r.every_months, r.day_of_month);
      }
    }
    for (const l of loans ?? []) {
      const { data: pays } = await db.from("loan_payments").select("n").eq("loan_id", l.id);
      const paid = new Set((pays ?? []).map((p) => p.n));
      for (const x of schedule(l)) if (!paid.has(x.n) && x.due >= today && x.due < until) obligations.push({ date: x.due, name: l.name, amount: toMdl(x.payment, l.currency) });
    }
    const { data: mem } = await db.from("members").select("telegram_id, lang, notify, prefs, role").eq("family_id", f.id).in("role", ["owner", "editor"]).not("telegram_id", "is", null);
    const owner = (mem ?? []).find((m) => m.role === "owner");
    const pct = Number(owner?.prefs?.salary?.pct ?? 10);
    const days = Math.max(1, Math.round((Date.parse(until) - Date.parse(today)) / 86400000));
    const plan = salaryPlan(sal.mdl, obligations, pct, days);
    const names = [...new Set(plan.list.map((o: Any) => o.name))].slice(0, 4).join(", ");
    const untilTxt = until.split("-").reverse().join(".");
    for (const m of mem ?? []) {
      if (m.notify?.salary === false) continue;
      const lg = m.lang === "ru" ? "ru" : "ro";
      await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: SAL[lg](plan, untilTxt, names), reply_markup: { inline_keyboard: [[{ text: T[lg].open, web_app: { url: APP_URL } }]] } });
    }
  }
}

// Sold sub pragul ales pe cont: o alertă la coborâre, rearmată după suplinire (rulează la 15 minute)
async function lowAccounts() {
  const { data: accs } = await db.from("accounts").select("id, family_id, name, currency, low_alert, low_sent").not("low_alert", "is", null).eq("archived", false);
  if (!accs?.length) return;
  const { data: bals } = await db.from("account_balances").select("account_id, balance").in("account_id", accs.map((a) => a.id));
  for (const a of accs) {
    const bal = Number((bals ?? []).find((b) => b.account_id === a.id)?.balance ?? 0);
    const low = bal < Number(a.low_alert);
    if (low === a.low_sent) continue;
    // lacăt: doar o rulare schimbă starea
    const { data: ch } = await db.from("accounts").update({ low_sent: low }).eq("id", a.id).eq("low_sent", a.low_sent).select("id");
    if (!ch?.length || !low) continue;
    const { data: mem } = await db.from("members").select("telegram_id, lang, notify").eq("family_id", a.family_id).in("role", ["owner", "editor"]).not("telegram_id", "is", null);
    for (const m of mem ?? []) {
      if (m.notify?.lowacc === false) continue;
      const ru = m.lang === "ru";
      const v = (n: number) => n.toFixed(2).replace(".", ",");
      await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id,
        text: ru ? `🔻 На «${a.name}» осталось ${v(bal)} ${a.currency} — меньше порога ${v(Number(a.low_alert))}. Пополните счёт заранее.`
          : `🔻 Pe „${a.name}” au rămas ${v(bal)} ${a.currency} — sub pragul de ${v(Number(a.low_alert))}. Suplinește contul din timp.`,
        reply_markup: { inline_keyboard: [[{ text: ru ? "Открыть" : "Deschide", web_app: { url: APP_URL } }]] } });
    }
  }
}

async function evening(today: string) {
  await salaryNotice(today).catch((e) => console.error("salariu", e));
  if (!eveningWindow(nowLocalHM())) return;
  const rates = await latestRates();
  const toMdl = (a: number, cur: string) => a * (rates[cur] ?? 1);
  const month = today.slice(0, 7);
  const [y, mo] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const daysLeft = lastDay - Number(today.slice(8, 10));
  const { data: families } = await db.from("families").select("id");
  for (const f of families ?? []) {
    if (!(await once(`evening:${f.id}:${today}`))) continue;
    const { data: mem } = await db.from("members").select("telegram_id, lang, notify")
      .eq("family_id", f.id).in("role", ["owner", "editor"]).not("telegram_id", "is", null);
    const members = (mem ?? []) as Member[];
    if (!members.length) continue;
    const { data: txs } = await db.from("transactions").select("kind, amount, date, merchant, category_id, accounts!transactions_account_id_fkey(currency), categories(name_ro, name_ru, budget)")
      .eq("family_id", f.id).gte("date", `${month}-01`).lte("date", today).in("kind", ["income", "expense"]);
    const { data: cats } = await db.from("categories").select("id, budget").eq("family_id", f.id).eq("kind", "expense").eq("archived", false);
    const budget = (cats ?? []).reduce((s, c) => s + (Number(c.budget) || 0), 0);
    const budgeted = new Set((cats ?? []).filter((c) => Number(c.budget) > 0).map((c) => c.id));
    let dayExp = 0, dayInc = 0, n = 0, monthExp = 0, monthBudgeted = 0;
    const items: { v: number; ro: string; ru: string }[] = [];
    // deno-lint-ignore no-explicit-any
    for (const t of (txs ?? []) as any[]) {
      const v = toMdl(Number(t.amount), t.accounts?.currency ?? "MDL");
      if (t.kind === "expense") {
        monthExp += v;
        if (budgeted.has(t.category_id)) monthBudgeted += v;
        if (t.date === today) { dayExp += v; n++; items.push({ v, ro: t.merchant || t.categories?.name_ro || "Altele", ru: t.merchant || t.categories?.name_ru || "Другое" }); }
      } else if (t.date === today) dayInc += v;
    }
    items.sort((a, b) => b.v - a.v);
    await send(members, "evening", (lg) => {
      const L = T[lg];
      const lines = [L.eHead, n ? L.eSpent(fmt(dayExp), n) : L.eNone];
      if (n) lines.push(...items.slice(0, 3).map((x) => `• ${lg === "ru" ? x.ru : x.ro} ${fmt(x.v)}`));
      if (dayInc) lines.push(L.eInc(fmt(dayInc)));
      lines.push("");
      if (budget > 0) {
        const left = budget - monthBudgeted;
        lines.push(left >= 0 ? L.eBudget(fmt(left), fmt(budget)) : L.eOver(fmt(-left)));
        if (left > 0 && daysLeft > 0) lines.push(L.ePerDay(fmt(left / daysLeft), daysLeft));
      } else lines.push(L.eMonth(fmt(monthExp)));
      return lines.join("\n");
    });
  }
}

// ───────── Sarcini ─────────
// Dimineața: fiecare primește sarcinile lui (și cele „pentru oricine”) de azi și întârziate
async function tasksDigest(today: string) {
  const { data: families } = await db.from("families").select("id");
  for (const f of families ?? []) {
    const { data: open } = await db.from("tasks").select("*").eq("family_id", f.id).eq("done", false).not("due_date", "is", null).lte("due_date", today).order("due_date");
    if (!open?.length) continue;
    const { data: mem } = await db.from("members").select("id, name, telegram_id, lang, role, notify").eq("family_id", f.id);
    for (const m of mem ?? []) {
      if (!m.telegram_id || m.role === "none" || m.notify?.tasks === false) continue;
      const mine = open.filter((t) => !t.assignee_id || t.assignee_id === m.id)
      if (!mine.length || !(await once(`tdigest:${m.id}:${today}`))) continue;
      const lg = m.lang === "ru" ? "ru" : "ro";
      await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: TT[lg].digest(mine.length) });
      for (const t of mine.slice(0, 8)) {
        await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: taskLine(t, lg, mem ?? [], today), reply_markup: taskButtons(t, lg, APP_URL) });
      }
    }
  }
}

// La fiecare 15 minute: mementoul sarcinilor cu oră, când a venit ora
async function tasksRemind(today: string) {
  const hm = nowLocalHM();
  const { data: due } = await db.from("tasks").select("*").eq("done", false).eq("due_date", today).not("due_time", "is", null).lte("due_time", hm + ":59");
  if (!due?.length) return;
  const byFam: Record<string, any[]> = {};
  for (const t of due) (byFam[t.family_id] ??= []).push(t);
  for (const [fid, list] of Object.entries(byFam)) {
    const { data: mem } = await db.from("members").select("id, name, telegram_id, lang, role, notify").eq("family_id", fid);
    for (const t of list) {
      if (!(await once(`tremind:${t.id}:${today}`))) continue;
      const to = (mem ?? []).filter((m) => m.telegram_id && m.role !== "none" && m.notify?.tasks !== false && (!t.assignee_id || t.assignee_id === m.id));
      for (const m of to) {
        const lg = m.lang === "ru" ? "ru" : "ro";
        await tg(BOT_TOKEN, "sendMessage", {
          chat_id: m.telegram_id, text: TT[lg].remind + "\n" + taskLine(t, lg, mem ?? [], today) + (t.kind === "money" ? "\n" + TT[lg].money : ""),
          reply_markup: taskButtons(t, lg, APP_URL),
        });
      }
    }
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
    // Închiderea lunii: memento cu lista de verificat din aplicație
    for (const m of members) {
      if (m.notify?.monthly === false) continue;
      const ru = m.lang === "ru";
      await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id,
        text: ru ? "✅ Закройте месяц: 2 минуты на проверку категорий, дублей и остатков — и отчёты будут верными." : "✅ Închide luna: 2 minute pentru categorii, dubluri și solduri — și rapoartele sunt corecte.",
        reply_markup: { inline_keyboard: [[{ text: ru ? "Закрыть месяц" : "Închide luna", web_app: { url: `${APP_URL}?view=close` } }]] } });
    }
  }
}

Deno.serve(async (req) => {
  const expected = await derivedSecret(BOT_TOKEN, "cron");
  if (req.headers.get("x-cron-secret") !== expected) return new Response("forbidden", { status: 403 });
  const task = new URL(req.url).searchParams.get("task") ?? "daily";
  const today = todayLocal();
  // Ține la zi adresa și secretul pentru programările din baza de date (pg_cron)
  await db.from("cron_config").upsert({ id: 1, base_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1`, secret: expected, updated_at: new Date().toISOString() }).then(() => {}, () => {});
  if (task === "release") {
    // chemat de publicare, cu lista ultimelor schimbări: anunțăm în bot ce e nou (cel mult o dată la 6 ore)
    const body = await req.json().catch(() => ({}));
    const out = await release(body);
    return new Response(JSON.stringify({ ok: true, task, ...out }), { headers: { "content-type": "application/json" } });
  }
  if (task === "setup") {
    const { data: cron } = await db.rpc("cron_status");
    return new Response(JSON.stringify({ ok: true, task, cron }), { headers: { "content-type": "application/json" } });
  }
  // Aceeași sarcină vine și din baza de date, și din GitHub (rezervă): rulează o singură dată pe zi
  if (["daily", "weekly", "monthly"].includes(task) && !(await once(`run:${task}:${today}`))) {
    return new Response(JSON.stringify({ ok: true, task, today, skipped: "already" }), { headers: { "content-type": "application/json" } });
  }
  if (task === "weekly") await weekly(today);
  else if (task === "monthly") await monthly(today);
  else if (task === "evening") await evening(today);
  else if (task === "remind") { await tasksRemind(today); await salaryNotice(today).catch((e) => console.error("salariu", e)); await lowAccounts().catch((e) => console.error("prag", e)); }
  else {
    await daily(today);
    await fxAlerts(today).catch((e) => console.error("fx", e));
    await tasksDigest(today).catch((e) => console.error("tasks", e));
    // Istoricul modificărilor se păstrează un an
    await db.from("audit_log").delete().lt("at", new Date(Date.now() - 365 * 86400000).toISOString());
  }
  return new Response(JSON.stringify({ ok: true, task, today }), { headers: { "content-type": "application/json" } });
});
