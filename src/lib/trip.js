// Călătorii: cât s-a cheltuit (în moneda călătoriei), pe categorii, pe zi și pe persoană, față de plan
const DAY = 86400000
export const tripDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1

// txs: tranzacțiile cu eticheta călătoriei; conv(amount, fromCur) → suma în moneda călătoriei
export function tripStats(trip, txs, conv, today) {
  const byCat = {}, byCur = {}
  let spent = 0, income = 0
  for (const x of txs) {
    if (x.kind !== 'expense' && x.kind !== 'income') continue
    const v = conv(Number(x.amount), x.currency || 'MDL')
    if (x.kind === 'income') { income += v; continue } // ex. bani întorși
    spent += v
    const c = x.category_id || '-'
    byCat[c] = (byCat[c] || 0) + v
    byCur[x.currency || 'MDL'] = (byCur[x.currency || 'MDL'] || 0) + Number(x.amount)
  }
  const net = spent - income
  const days = tripDays(trip.start_date, trip.end_date)
  const status = today < trip.start_date ? 'before' : today > trip.end_date ? 'after' : 'during'
  const elapsed = status === 'before' ? 0 : status === 'after' ? days : tripDays(trip.start_date, today)
  const budget = trip.budget != null ? Number(trip.budget) : null
  const left = budget != null ? budget - net : null
  const daysLeft = status === 'after' ? 0 : days - elapsed + (status === 'during' ? 1 : 0) // azi încă se poate cheltui
  const plan = (trip.plan || []).map((p) => ({ category_id: p.category_id, amount: Number(p.amount) || 0, spent: byCat[p.category_id || '-'] || 0 }))
  const planned = new Set(plan.map((p) => p.category_id || '-'))
  const extra = Object.entries(byCat).filter(([c]) => !planned.has(c)).map(([c, v]) => ({ category_id: c === '-' ? null : c, amount: 0, spent: v }))
  return {
    spent, income, net, days, elapsed, status, budget, left,
    perDay: net / Math.max(1, status === 'before' ? days : elapsed),
    perPerson: net / Math.max(1, trip.people || 1),
    allowPerDay: left != null && daysLeft > 0 ? left / daysLeft : null,
    pct: budget ? net / budget : null,
    byCur, rows: [...plan, ...extra.sort((a, b) => b.spent - a.spent)],
  }
}

// Călătoria în care cade o dată (pentru eticheta automată)
export const tripOn = (trips, iso) => trips.find((t) => t.auto_tag && t.start_date <= iso && iso <= t.end_date) || null
