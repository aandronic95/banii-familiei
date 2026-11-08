// Alerte noi: cheltuieli peste obișnuit la mijloc de lună, sold mic înainte de o plată, verificarea cash-ului
export type Pace = { cat: string; spent: number; usual: number; daysLeft: number };

// spent: cât s-a cheltuit luna asta pe categorie; past: totalurile ultimelor luni întregi (MDL)
export function paceAlerts(spent: Record<string, number>, past: Record<string, number[]>, day: number, daysInMonth: number): Pace[] {
  const out: Pace[] = [];
  const daysLeft = daysInMonth - day;
  if (daysLeft < 5) return out; // la sfârșit de lună nu mai e o surpriză
  for (const [cat, s] of Object.entries(spent)) {
    const h = (past[cat] ?? []).filter((v) => v > 0);
    if (h.length < 2) continue; // prea puține luni ca să știm ce e „obișnuit”
    const usual = h.reduce((a, b) => a + b, 0) / h.length;
    if (usual >= 300 && s >= usual) out.push({ cat, spent: s, usual, daysLeft });
  }
  return out.sort((a, b) => b.spent / b.usual - a.spent / a.usual);
}

export type Due = { name: string; amount: number; accountId: string };
// Plățile de mâine pe fiecare cont, față de soldul lui
export function lowBalance(dues: Due[], balances: Record<string, number>) {
  const by: Record<string, { total: number; names: string[] }> = {};
  for (const d of dues) {
    by[d.accountId] ??= { total: 0, names: [] };
    by[d.accountId].total += d.amount;
    by[d.accountId].names.push(d.name);
  }
  return Object.entries(by).filter(([id, v]) => (balances[id] ?? 0) < v.total - 0.005)
    .map(([accountId, v]) => ({ accountId, total: Math.round(v.total * 100) / 100, names: v.names, balance: balances[accountId] ?? 0 }));
}

// „1 230,50” / „1230.5” / „1.230,50” → 1230.5
export function parseMoney(s: string): number | null {
  const t = String(s ?? "").replace(/[^\d.,-]/g, "");
  if (!t) return null;
  const lastSep = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  const dec = lastSep >= 0 && t.length - lastSep - 1 <= 2 ? lastSep : -1;
  const n = dec >= 0 ? Number(t.slice(0, dec).replace(/[.,]/g, "") + "." + t.slice(dec + 1)) : Number(t.replace(/[.,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const f2 = (n: number) => new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\./g, " ");
const f0 = (n: number) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\./g, " ");
export const AT = {
  ro: {
    pace: (cat: string, s: number, u: number, left: number) => `📈 La „${cat}” ați cheltuit deja ${f0(s)} lei luna asta — cât de obicei pe toată luna (${f0(u)}). Mai sunt ${left} zile.`,
    low: (acc: string, bal: number, total: number, cur: string, names: string[]) => `⚠️ Mâine: ${names.join(", ")} — ${f2(total)} ${cur}. Pe „${acc}” sunt doar ${f2(bal)} ${cur}. Lipsesc ${f2(total - bal)}.`,
    cashAsk: (acc: string, bal: number, cur: string) => `💵 Verificarea portofelului: în «${acc}» aplicația arată ${f2(bal)} ${cur}. E corect?`,
    cashOk: "✅ Da, corect", cashFix: "✏️ Altă sumă",
    cashPrompt: (acc: string) => `💵 Scrie cât e de fapt în «${acc}» (doar suma, ex. 1 230):`,
    cashGood: "👍 Mulțumesc, soldul e corect.",
    cashDone: (diff: number, cur: string, now: number) => diff < 0
      ? `✅ Am corectat: −${f2(-diff)} ${cur} (cheltuieli netrecute). Acum: ${f2(now)} ${cur}.`
      : `✅ Am corectat: +${f2(diff)} ${cur} (bani netrecuți). Acum: ${f2(now)} ${cur}.`,
    cashSame: (now: number, cur: string) => `👍 Aceeași sumă ca în aplicație: ${f2(now)} ${cur}.`,
    cashBad: "Nu am înțeles suma. Răspunde la mesaj doar cu cifra, ex. 1230.",
    fixName: "Corectare sold", fixNote: "Diferența găsită la verificarea cash-ului",
  },
  ru: {
    pace: (cat: string, s: number, u: number, left: number) => `📈 На «${cat}» в этом месяце уже ${f0(s)} лей — столько, сколько обычно за весь месяц (${f0(u)}). Осталось ${left} дн.`,
    low: (acc: string, bal: number, total: number, cur: string, names: string[]) => `⚠️ Завтра: ${names.join(", ")} — ${f2(total)} ${cur}. На «${acc}» только ${f2(bal)} ${cur}. Не хватает ${f2(total - bal)}.`,
    cashAsk: (acc: string, bal: number, cur: string) => `💵 Проверка кошелька: в «${acc}» по приложению ${f2(bal)} ${cur}. Верно?`,
    cashOk: "✅ Да, верно", cashFix: "✏️ Другая сумма",
    cashPrompt: (acc: string) => `💵 Напишите, сколько на самом деле в «${acc}» (только сумму, напр. 1 230):`,
    cashGood: "👍 Спасибо, остаток верный.",
    cashDone: (diff: number, cur: string, now: number) => diff < 0
      ? `✅ Исправлено: −${f2(-diff)} ${cur} (незаписанные расходы). Сейчас: ${f2(now)} ${cur}.`
      : `✅ Исправлено: +${f2(diff)} ${cur} (незаписанные деньги). Сейчас: ${f2(now)} ${cur}.`,
    cashSame: (now: number, cur: string) => `👍 Та же сумма, что в приложении: ${f2(now)} ${cur}.`,
    cashBad: "Не понял сумму. Ответьте на сообщение только числом, напр. 1230.",
    fixName: "Корректировка остатка", fixNote: "Разница при проверке наличных",
  },
};
