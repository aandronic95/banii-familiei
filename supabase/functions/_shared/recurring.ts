// Plăți regulate cu confirmare: botul întreabă „A venit/S-a plătit?” și adaugă doar după „Da”.
import { nextOccurrence } from "./loan.ts";
import { shiftWorkday } from "./workday.ts";

// deno-lint-ignore no-explicit-any
type Rec = any;
export const dueDate = (r: Rec, d = r.next_date) => shiftWorkday(d, r.workday ?? "none");

export const RT = {
  ro: {
    ask: (name: string, sign: string, amt: string, cur: string, late: number) =>
      `🔁 ${late > 0 ? `De ${late} ${late === 1 ? "zi" : "zile"} e programat` : "Azi e programat"}: „${name}” ${sign}${amt} ${cur}.\n${sign === "+" ? "Au venit banii?" : "S-a plătit?"}`,
    yes: (inc: boolean) => (inc ? "✅ Da, au venit" : "✅ Da, s-a plătit"), later: "⏳ Încă nu", other: "✏️ Altă sumă", skip: "⏭ Sari luna asta",
    added: (name: string, sign: string, amt: string, cur: string) => `✅ Adăugat: „${name}” ${sign}${amt} ${cur}.`,
    skipped: (name: string) => `⏭ „${name}” sărit de data asta.`, asked: "Te întreb din nou mâine.", done: "Deja confirmat.",
  },
  ru: {
    ask: (name: string, sign: string, amt: string, cur: string, late: number) =>
      `🔁 ${late > 0 ? `Уже ${late} дн. назад запланировано` : "Сегодня запланировано"}: «${name}» ${sign}${amt} ${cur}.\n${sign === "+" ? "Деньги пришли?" : "Оплачено?"}`,
    yes: (inc: boolean) => (inc ? "✅ Да, пришли" : "✅ Да, оплачено"), later: "⏳ Ещё нет", other: "✏️ Другая сумма", skip: "⏭ Пропустить",
    added: (name: string, sign: string, amt: string, cur: string) => `✅ Добавлено: «${name}» ${sign}${amt} ${cur}.`,
    skipped: (name: string) => `⏭ «${name}» пропущено в этот раз.`, asked: "Спрошу снова завтра.", done: "Уже подтверждено.",
  },
};

export function askKeyboard(r: Rec, lg: "ro" | "ru", appUrl: string) {
  const t = RT[lg];
  const d = r.next_date;
  return {
    inline_keyboard: [
      [{ text: t.yes(r.kind === "income"), callback_data: `rok:${r.id}:${d}` }],
      [{ text: t.later, callback_data: `rno:${r.id}:${d}` }, { text: t.other, web_app: { url: `${appUrl}?rec=${r.id}` } }],
      [{ text: t.skip, callback_data: `rsk:${r.id}:${d}` }],
    ],
  };
}

// Mută next_date mai departe doar dacă n-a făcut-o deja altcineva (aplicația sau alt membru) — ăsta e „lacătul”
// deno-lint-ignore no-explicit-any
export async function advance(db: any, r: Rec, from: string): Promise<boolean> {
  const next = nextOccurrence(from, r.every_months, r.day_of_month);
  const { data } = await db.from("recurring").update({ next_date: next }).eq("id", r.id).eq("next_date", from).select("id");
  return !!data?.length;
}

// „Da”: adaugă tranzacția (data = ziua plății, sau azi dacă a venit mai târziu)
// deno-lint-ignore no-explicit-any
export async function confirmRec(db: any, r: Rec, from: string, accountId: string, today: string, memberId?: string | null) {
  // ziua plății (după mutarea de pe weekend) e doar pentru întrebare; data tranzacției e ziua confirmării
  if (!(await advance(db, r, from))) return { ok: false as const };
  const date = today; // ziua în care banii au venit / s-a plătit de fapt
  const { error } = await db.from("transactions").insert({
    family_id: r.family_id, kind: r.kind, amount: r.amount, account_id: accountId, category_id: r.category_id,
    member_id: r.member_id ?? memberId ?? null, date, merchant: r.name, note: "Plată recurentă", recurring_id: r.id,
  });
  if (error) {
    await db.from("recurring").update({ next_date: from }).eq("id", r.id); // punem înapoi
    return { ok: false as const };
  }
  return { ok: true as const, date };
}
