// Din bot: „datorie octavian 600” → la Datorii (nu cheltuială), „întors datorie danu 500” → întoarcerea datoriei
import { classifyDebt, samePerson } from "./debtparse.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
export { classifyDebt };

export async function convertDebt(db: Any, tx: Any, cls: Any, currency: string) {
  cls = { ...cls };
  const amount = Number(tx.amount);
  const cur = ["MDL", "EUR", "USD"].includes(currency) ? currency : "MDL";
  const person = cls.person || tx.merchant || "—";
  let debtId: string | null = null;
  if (cls.type === "lend" || cls.type === "borrow") {
    const { data } = await db.from("debts").insert({ family_id: tx.family_id, direction: cls.direction, person, amount, paid: 0, currency: cur, date: tx.date, member_id: tx.member_id, settled: false }).select("id").single();
    debtId = data?.id ?? null;
  } else {
    const { data: open } = await db.from("debts").select("*").eq("family_id", tx.family_id).eq("settled", false).eq("currency", cur).order("date");
    // „întors datorie danu”: dacă Danu ne datora, banii au venit la noi (chiar dacă a fost scris fără „+”), și invers
    let d = (open ?? []).find((x: Any) => x.direction === cls.direction && samePerson(x.person, person));
    const other = (open ?? []).find((x: Any) => x.direction !== cls.direction && samePerson(x.person, person));
    if (!d && other) { d = other; cls = { ...cls, direction: other.direction, type: other.direction === "owed_to_us" ? "repaid" : "repay" }; }
    if (d) {
      const paid = Math.round((Number(d.paid) + amount) * 100) / 100;
      await db.from("debts").update({ paid: Math.min(paid, Number(d.amount)), settled: paid >= Number(d.amount) - 0.005 }).eq("id", d.id);
      debtId = d.id;
    } else {
      const { data } = await db.from("debts").insert({ family_id: tx.family_id, direction: cls.direction, person, amount, paid: amount, currency: cur, date: tx.date, member_id: tx.member_id, note: "datorie de dinainte, întoarsă", settled: true }).select("id").single();
      debtId = data?.id ?? null;
    }
  }
  if (!debtId) return null;
  const out = cls.type === "lend" || cls.type === "repay";
  await db.from("transactions").update({ kind: out ? "invest" : "divest", category_id: null, debt_id: debtId, merchant: person }).eq("id", tx.id);
  const { data: debt } = await db.from("debts").select("*").eq("id", debtId).single();
  return { person, debt, type: cls.type as string };
}

// „Anulează” pe o datorie: dacă datoria a apărut din mesajul ăsta, dispare; dacă era o întoarcere, se scade
export async function undoDebt(db: Any, tx: Any) {
  if (!tx?.debt_id) return;
  const { data: d } = await db.from("debts").select("*").eq("id", tx.debt_id).maybeSingle();
  if (!d) return;
  const { data: others } = await db.from("transactions").select("id").eq("debt_id", d.id).neq("id", tx.id).limit(1);
  const repayment = (d.direction === "owed_to_us") === (tx.kind === "divest");
  if (!others?.length && (!repayment || Number(d.paid) <= Number(tx.amount) + 0.005)) { await db.from("debts").delete().eq("id", d.id); return; }
  if (repayment) {
    const paid = Math.max(0, Math.round((Number(d.paid) - Number(tx.amount)) * 100) / 100);
    await db.from("debts").update({ paid, settled: paid >= Number(d.amount) - 0.005 }).eq("id", d.id);
  }
}

export function debtLine(person: string, d: Any, type: string, ru: boolean, amt: string) {
  const left = (Number(d.amount) - Number(d.paid)).toFixed(2).replace(".", ",");
  if (ru) return type === "lend" ? `🤝 В Долгах: ${person} должен вам ${amt} ${d.currency}` : type === "borrow" ? `🤝 В Долгах: вы должны ${person} ${amt} ${d.currency}` : `🤝 ${type === "repaid" ? `${person} вернул` : `Вы вернули ${person}`} ${amt} ${d.currency}` + (d.settled ? " — долг закрыт" : ` — осталось ${left}`);
  return type === "lend" ? `🤝 La Datorii: ${person} îți datorează ${amt} ${d.currency}` : type === "borrow" ? `🤝 La Datorii: datorezi lui ${person} ${amt} ${d.currency}` : `🤝 ${type === "repaid" ? `${person} a întors` : `Ai întors lui ${person}`} ${amt} ${d.currency}` + (d.settled ? " — datoria e închisă" : ` — mai rămân ${left}`);
}
