// Grafic de rambursare anuitar (aceeași logică ca src/lib/loan.js din aplicație)
export type Loan = {
  principal: number; annual_rate: number; term_months: number; first_due: string;
  monthly_payment?: number | null; paid_before?: number;
};
export type Installment = { n: number; due: string; payment: number; interest: number; principal: number; balance: number };

export function addMonths(iso: string, k: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function schedule(l: Loan): Installment[] {
  const P = Number(l.principal), n = Number(l.term_months), r = Number(l.annual_rate) / 1200;
  const pay = l.monthly_payment ? Number(l.monthly_payment) : r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
  let bal = P;
  const out: Installment[] = [];
  for (let i = 1; i <= n && bal > 0.005; i++) {
    const interest = r2(bal * r);
    let principal = r2(pay - interest);
    if (i === n || principal > bal) principal = r2(bal);
    bal = r2(bal - principal);
    out.push({ n: i, due: addMonths(l.first_due, i - 1), payment: r2(principal + interest), interest, principal, balance: bal });
  }
  return out;
}

export function nextUnpaid(l: Loan, paidNs: number[]): Installment | null {
  const paid = new Set(paidNs);
  return schedule(l).find((x) => x.n > (l.paid_before ?? 0) && !paid.has(x.n)) ?? null;
}

// Următoarea dată a unei plăți recurente: peste `every` luni, în ziua `dom` (sau ultima zi a lunii)
export function nextOccurrence(iso: string, every: number, dom: number): string {
  const [y, m] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + every, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(dom, last));
  return t.toISOString().slice(0, 10);
}

// O plată recurentă care e de fapt rata unui credit deja introdus (aceeași sumă ±3%, în jurul aceleiași zile).
// Se folosește ca să nu se numere rata de două ori. Întoarce creditul potrivit sau null.
export function loanForRecurring(
  r: { kind: string; amount: number | string; next_date: string },
  loans: (Loan & { id?: string; closed?: boolean; currency?: string })[],
  date: string = r.next_date,
): (Loan & { id?: string }) | null {
  if (r.kind !== "expense") return null;
  const amt = Number(r.amount);
  for (const l of loans) {
    if (l.closed) continue;
    const near = schedule(l).find((x) => Math.abs(Date.parse(x.due) - Date.parse(date)) <= 5 * 86400000);
    if (near && Math.abs(near.payment - amt) <= Math.max(near.payment * 0.03, 50)) return l;
  }
  return null;
}
