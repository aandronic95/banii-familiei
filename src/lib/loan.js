// Grafic de rambursare anuitar (aceeași logică ca supabase/functions/_shared/loan.ts)
export function addMonths(iso, k) {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + k, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

const r2 = (x) => Math.round(x * 100) / 100

export function schedule(l) {
  const P = Number(l.principal), n = Number(l.term_months), r = Number(l.annual_rate) / 1200
  const pay = l.monthly_payment ? Number(l.monthly_payment) : r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n))
  let bal = P
  const out = []
  for (let i = 1; i <= n && bal > 0.005; i++) {
    const interest = r2(bal * r)
    let principal = r2(pay - interest)
    if (i === n || principal > bal) principal = r2(bal)
    bal = r2(bal - principal)
    out.push({ n: i, due: addMonths(l.first_due, i - 1), payment: r2(principal + interest), interest, principal, balance: bal })
  }
  return out
}

// Starea unui credit: câte rate sunt plătite, soldul rămas, următoarea rată
export function loanStatus(l, payments) {
  const sch = schedule(l)
  const paid = new Set(payments.filter((p) => p.loan_id === l.id).map((p) => p.n))
  for (let i = 1; i <= (l.paid_before || 0); i++) paid.add(i)
  const unpaid = sch.filter((x) => !paid.has(x.n))
  const next = unpaid[0] || null
  const prev = next ? sch[next.n - 2] : sch[sch.length - 1]
  const remaining = next ? (prev ? prev.balance : Number(l.principal)) : 0
  const paidCount = sch.length - unpaid.length
  return {
    schedule: sch,
    paid,
    next,
    remaining,
    paidCount,
    total: sch.length,
    progress: Number(l.principal) ? 1 - remaining / Number(l.principal) : 1,
    payment: sch[0]?.payment || 0,
  }
}

// Următoarea dată a unei plăți recurente (la fel ca pe server)
export function nextOccurrence(iso, every, dom) {
  const [y, m] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + every, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(dom, last))
  return t.toISOString().slice(0, 10)
}
