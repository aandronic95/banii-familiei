// @ts-nocheck — copie identică a src/lib/home.js (testul verifică)
// Calcule pentru casă și familie (fără dependențe, testabile): contoare, evenimente, regula 50/30/20

// ── Evenimente (zile de naștere) ──
// Următoarea dată a unui eveniment anual, de azi încolo (29 feb → 28 feb în anii obișnuiți)
export function nextEventDate(dateISO, today, yearly = true) {
  if (!yearly) return dateISO >= today ? dateISO : null
  const [, m, d] = dateISO.split('-').map(Number)
  const y0 = +today.slice(0, 4)
  for (const y of [y0, y0 + 1]) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const c = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
    if (c >= today) return c
  }
  return null
}
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
// Câți ani împlinește la următoarea dată (doar dacă anul e cunoscut)
export function turning(dateISO, nextISO, hasYear) {
  if (!hasYear || !nextISO) return null
  const n = +nextISO.slice(0, 4) - +dateISO.slice(0, 4)
  return n > 0 && n < 150 ? n : null
}

// ── Contoare ──
// Consumul pe luni din indicii succesivi: diferența se pune pe luna indicelui nou.
// Un indice mai mic decât cel anterior (contor schimbat) începe o serie nouă, fără consum negativ.
export function meterUsage(readings) {
  const rs = [...readings].sort((a, b) => a.date.localeCompare(b.date) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
  const months = {}
  const periods = []
  for (let i = 1; i < rs.length; i++) {
    const a = rs[i - 1], b = rs[i]
    const used = Number(b.value) - Number(a.value)
    if (used < 0) continue
    const k = b.date.slice(0, 7)
    months[k] = (months[k] || 0) + used
    periods.push({ from: a.date, to: b.date, used: Math.round(used * 1000) / 1000, days: Math.max(1, daysBetween(a.date, b.date)) })
  }
  const last = rs.at(-1) || null
  const lastPeriod = periods.at(-1) || null
  const perDay = lastPeriod ? lastPeriod.used / lastPeriod.days : null
  return { months, periods, last, lastPeriod, perDay }
}

// ── Regula 50/30/20 ──
// Necesare: mâncare, casă, utilități, sănătate, mașină, copil, rate. Dorințe: restul. Economii: ce rămâne din venit.
const NEEDS = new Set(['cart', 'home', 'bolt', 'heart', 'car', 'school', 'bank', 'fuel'])
export const bucketOf = (cat) => (cat?.bucket ? cat.bucket : cat && NEEDS.has(cat.icon) ? 'needs' : 'wants')
// rows: [{ amount (MDL), category }] doar cheltuieli; income: venitul perioadei (MDL)
export function rule503020(rows, income) {
  let needs = 0, wants = 0
  const byCat = {}
  for (const r of rows) {
    const b = bucketOf(r.category)
    if (b === 'needs') needs += r.amount; else wants += r.amount
    const k = r.category?.id || '-'
    byCat[k] ??= { category: r.category || null, bucket: b, amount: 0 }
    byCat[k].amount += r.amount
  }
  const savings = income - needs - wants
  const pct = (x) => (income > 0 ? Math.round((x / income) * 100) : null)
  const topWants = Object.values(byCat).filter((x) => x.bucket === 'wants').sort((a, b) => b.amount - a.amount).slice(0, 3)
  return { income, needs, wants, savings, pNeeds: pct(needs), pWants: pct(wants), pSavings: pct(savings), topWants,
    overWants: income > 0 ? Math.max(0, wants - income * 0.3) : 0, overNeeds: income > 0 ? Math.max(0, needs - income * 0.5) : 0 }
}
