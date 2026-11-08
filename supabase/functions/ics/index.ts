// Calendarul plăților familiei, ca abonament în Google Calendar / iPhone.
// Linkul conține un cod secret al familiei (îl dă aplicația); fără el nu se vede nimic.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { buildIcs, type CalEvent } from "../_shared/ical.ts";
import { loanForRecurring, nextOccurrence, schedule } from "../_shared/loan.ts";
import { dueDate } from "../_shared/recurring.ts";
import { payoutSchedule } from "../_shared/invest.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());
const fmt = (n: number) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100).replace(/\./g, " ");
const addDays = (d: string, k: number) => new Date(Date.parse(d) + k * 86400000).toISOString().slice(0, 10);

const TXT = {
  ro: { cal: "Banii familiei", loan: "Rata", rate: "rata", pay: "Plată", inc: "Venit", event: "", car: "Mașina", debtUs: "îți întoarce", debtWe: "întorci lui", coupon: "Dobândă", task: "Sarcină" },
  ru: { cal: "Семейный бюджет", loan: "Кредит", rate: "платёж", pay: "Платёж", inc: "Доход", event: "", car: "Машина", debtUs: "возвращает вам", debtWe: "вернуть", coupon: "Проценты", task: "Задача" },
};

Deno.serve(async (req) => {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (!/^[0-9a-f]{32,64}$/.test(k)) return new Response("not found", { status: 404 });
  const { data: fam } = await db.from("families").select("id, name").eq("ics_token", k).maybeSingle();
  if (!fam) return new Response("not found", { status: 404 });
  const f = fam.id;
  const { data: owner } = await db.from("members").select("lang").eq("family_id", f).eq("role", "owner").maybeSingle();
  const lg = owner?.lang === "ru" ? "ru" : "ro";
  const t = TXT[lg];
  const today = todayLocal(), from = addDays(today, -31), to = addDays(today, 365);
  const ev: CalEvent[] = [];

  const [{ data: accs }, { data: loans }, { data: recs }, { data: events }, { data: carEv }, { data: debts }, { data: invs }, { data: tasks }] = await Promise.all([
    db.from("accounts").select("id, currency").eq("family_id", f),
    db.from("loans").select("*").eq("family_id", f).eq("closed", false),
    db.from("recurring").select("*").eq("family_id", f).eq("active", true),
    db.from("events").select("id, title, date, kind, has_year, yearly, gift_budget").eq("family_id", f),
    db.from("car_events").select("id, title, due_date, amount").eq("family_id", f).eq("done", false).not("due_date", "is", null),
    db.from("debts").select("id, person, direction, amount, paid, currency, due_date").eq("family_id", f).eq("settled", false).not("due_date", "is", null),
    db.from("investments").select("*").eq("family_id", f).neq("status", "closed"),
    db.from("tasks").select("id, title, due_date, amount, kind, done").eq("family_id", f).eq("done", false).not("due_date", "is", null),
  ]);
  const curOf = (id: string | null) => (accs ?? []).find((a) => a.id === id)?.currency ?? "MDL";

  // Rate la credite
  for (const l of loans ?? []) {
    const { data: pays } = await db.from("loan_payments").select("n").eq("loan_id", l.id);
    const paid = new Set((pays ?? []).map((p) => p.n));
    for (const x of schedule(l)) {
      if (x.due < from || x.due > to || paid.has(x.n)) continue;
      ev.push({ uid: `loan-${l.id}-${x.n}`, date: x.due, title: `💳 ${l.name} — ${fmt(x.payment)} ${l.currency}`, note: `${t.loan}: ${t.rate} ${x.n}`, alarm: true });
    }
  }
  // Plăți recurente și salariul (mutate de pe weekend, dacă așa sunt setate)
  for (const r of recs ?? []) {
    let d = r.next_date, g = 0;
    while (dueDate(r, d) <= to && g++ < 60) {
      const dd = dueDate(r, d);
      if (dd >= from && !loanForRecurring(r, loans ?? [], d)) {
        const inc = r.kind === "income";
        ev.push({ uid: `rec-${r.id}-${d}`, date: dd, title: `${inc ? "💰" : "🔁"} ${r.name} ${inc ? "+" : "—"} ${fmt(Number(r.amount))} ${curOf(r.account_id)}`, note: inc ? t.inc : t.pay, alarm: !inc });
      }
      d = nextOccurrence(d, r.every_months, r.day_of_month);
    }
  }
  // Zile de naștere și evenimente: anual, de la data lor
  for (const e of events ?? []) {
    const y = Number(today.slice(0, 4));
    const start = e.yearly ? (e.has_year ? e.date : `${y}-${e.date.slice(5)}`) : e.date;
    ev.push({ uid: `event-${e.id}`, date: start, title: `${e.kind === "birthday" ? "🎂" : "📅"} ${e.title}${e.gift_budget ? ` (🎁 ${fmt(Number(e.gift_budget))} MDL)` : ""}`, yearly: !!e.yearly, alarm: true });
  }
  for (const c of carEv ?? []) if (c.due_date >= from && c.due_date <= to) ev.push({ uid: `car-${c.id}`, date: c.due_date, title: `🚗 ${c.title}${c.amount ? ` — ${fmt(Number(c.amount))} MDL` : ""}`, note: t.car, alarm: true });
  for (const d of debts ?? []) {
    const left = Number(d.amount) - Number(d.paid);
    ev.push({ uid: `debt-${d.id}`, date: d.due_date, title: `🤝 ${d.direction === "owed_to_us" ? `${d.person} ${t.debtUs}` : `${t.debtWe} ${d.person}`} ${fmt(left)} ${d.currency}`, alarm: true });
  }
  // Dobânzi / rate de la investiții
  for (const i of invs ?? []) {
    for (const p of payoutSchedule(i)) {
      if (p.date < from || p.date > to) continue;
      ev.push({ uid: `inv-${i.id}-${p.date}`, date: p.date, title: `📈 ${i.name} +${fmt(Number(p.interest) + Number(p.principal))} ${i.currency}`, note: t.coupon });
    }
  }
  for (const k2 of tasks ?? []) if (k2.due_date >= from && k2.due_date <= to) ev.push({ uid: `task-${k2.id}`, date: k2.due_date, title: `✅ ${k2.title}${k2.amount ? ` — ${fmt(Number(k2.amount))} MDL` : ""}`, note: t.task });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = buildIcs(`${t.cal}${fam.name ? " · " + fam.name : ""}`, ev, stamp);
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=1800", "content-disposition": 'inline; filename="banii-familiei.ics"' } });
});
