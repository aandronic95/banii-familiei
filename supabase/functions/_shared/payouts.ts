// Dobânzi și rate de la investiții, puse pe contul ales: automat sau după „Da, au venit” în bot
import { duePayouts } from "./invest.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
export const PT = {
  ro: {
    ask: (name: string, amt: string, cur: string, acc: string, d: string, late: number) =>
      `📈 ${late > 0 ? `Pe ${d} trebuia să vină` : "Azi trebuie să vină"} plata de la „${name}”: +${amt} ${cur} pe ${acc}.\nAu venit banii?`,
    added: (name: string, amt: string, cur: string, acc: string) => `✅ Adăugat: „${name}” +${amt} ${cur} pe ${acc}.`,
    skipped: (name: string) => `⏭ Plata de la „${name}” sărită de data asta.`,
    yes: "✅ Da, au venit", later: "⏳ Încă nu", other: "✏️ Altă sumă", skip: "⏭ Sari", asked: "Te întreb din nou mâine.", done: "Deja confirmat.",
    interest: "Dobândă", principal: "Suma întoarsă",
  },
  ru: {
    ask: (name: string, amt: string, cur: string, acc: string, d: string, late: number) =>
      `📈 ${late > 0 ? `${d} должна была прийти` : "Сегодня должна прийти"} выплата по «${name}»: +${amt} ${cur} на ${acc}.\nДеньги пришли?`,
    added: (name: string, amt: string, cur: string, acc: string) => `✅ Добавлено: «${name}» +${amt} ${cur} на ${acc}.`,
    skipped: (name: string) => `⏭ Выплата по «${name}» пропущена в этот раз.`,
    yes: "✅ Да, пришли", later: "⏳ Ещё нет", other: "✏️ Другая сумма", skip: "⏭ Пропустить", asked: "Спрошу снова завтра.", done: "Уже подтверждено.",
    interest: "Проценты", principal: "Возврат суммы",
  },
};

export const convert = (a: number, from: string, to: string, rates: Record<string, number>) =>
  from === to ? a : Math.round(((a * (rates[from] ?? 1)) / (rates[to] ?? 1)) * 100) / 100;

export function payKeyboard(inv: Any, date: string, lg: "ro" | "ru", appUrl: string) {
  const t = PT[lg];
  return {
    inline_keyboard: [
      [{ text: t.yes, callback_data: `pok:${inv.id}:${date}` }],
      [{ text: t.later, callback_data: `pno:${inv.id}:${date}` }, { text: t.other, web_app: { url: `${appUrl}?payout=${inv.id}` } }],
      [{ text: t.skip, callback_data: `psk:${inv.id}:${date}` }],
    ],
  };
}

// Mută „adăugat până la” mai departe doar dacă n-a făcut-o deja altcineva
export async function advancePay(db: Any, inv: Any, date: string): Promise<boolean> {
  let q = db.from("investments").update({ paid_through: date }).eq("id", inv.id);
  q = inv.paid_through ? q.eq("paid_through", inv.paid_through) : q.is("paid_through", null);
  const { data } = await q.select("id");
  return !!data?.length;
}

// Adaugă plata: dobânda ca venit, suma întoarsă ca retragere din investiție; la scadență investiția se închide
export async function addPayout(db: Any, inv: Any, row: Any, acc: Any, rates: Record<string, number>, date: string, lg: "ro" | "ru" = "ro") {
  if (!(await advancePay(db, inv, row.date))) return null;
  const { data: cat } = await db.from("categories").select("id").eq("family_id", inv.family_id).eq("kind", "income").eq("icon", "percent").eq("archived", false).limit(1);
  const base = { family_id: inv.family_id, account_id: acc.id, member_id: inv.member_id, date, merchant: [inv.platform, inv.name].filter(Boolean).join(" · "), investment_id: inv.id };
  const interest = convert(Number(row.interest), inv.currency, acc.currency, rates);
  const principal = convert(Number(row.principal), inv.currency, acc.currency, rates);
  const rows = [];
  if (interest > 0) rows.push({ ...base, kind: "income", amount: interest, category_id: cat?.[0]?.id ?? null, note: PT[lg].interest });
  if (principal > 0) rows.push({ ...base, kind: "divest", amount: principal, note: PT[lg].principal });
  if (rows.length) {
    const { error } = await db.from("transactions").insert(rows);
    if (error) { await db.from("investments").update({ paid_through: inv.paid_through ?? null }).eq("id", inv.id); return null; }
  }
  if (inv.maturity_date && row.date >= inv.maturity_date) await db.from("investments").update({ status: "closed" }).eq("id", inv.id);
  return { total: Math.round((interest + principal) * 100) / 100 };
}

export const nextDue = (inv: Any, today: string) => duePayouts(inv, today)[0] ?? null;
