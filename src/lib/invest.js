// Dobânda acumulată simplă, ca la eVMS: suma × rata × zile / 365
const DAY = 86400000
export function accruedInterest(amount, ratePct, startISO, endISO) {
  if (!ratePct || !startISO || !endISO) return 0
  const days = Math.max(0, Math.round((Date.parse(endISO) - Date.parse(startISO)) / DAY))
  return Math.round(Number(amount) * (Number(ratePct) / 100) * (days / 365) * 100) / 100
}

// Aceeași formulă, dar cu fracțiuni de zi, ca suma să crească pe ecran secundă cu secundă.
// startMs/endMs în milisecunde; endMs = null înseamnă fără scadență.
const YEAR = 365 * DAY
export function liveAccrued(amount, ratePct, startMs, endMs, nowMs) {
  if (!ratePct || !amount || !Number.isFinite(startMs)) return 0
  const end = endMs != null && Number.isFinite(endMs) ? Math.min(nowMs, endMs) : nowMs
  return (Math.max(0, end - startMs) * Number(amount) * (Number(ratePct) / 100)) / YEAR
}
export const perDay = (amount, ratePct) => (Number(amount) * (Number(ratePct) || 0)) / 100 / 365

// Valoarea estimată a unui bun (mașină, casă): scade cu `depPct` % pe an, compus, de la data evaluării
export function assetValue(value, depPct, valueDateISO, atISO) {
  const v = Number(value) || 0
  const d = Number(depPct) || 0
  if (!d || !valueDateISO || !atISO || atISO === valueDateISO) return v
  // înainte de evaluare valoarea era mai mare (aceeași depreciere, socotită înapoi)
  const years = (Date.parse(atISO) - Date.parse(valueDateISO)) / (365.25 * DAY)
  return Math.round(v * Math.pow(1 - d / 100, years) * 100) / 100
}

// ── Plata dobânzii (cupon) ──
// eVMS (obligațiuni de stat): la 6 luni; licitații: anual; certificate / bonuri de trezorerie: la scadență.
export const FREQ_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
function addMonthsISO(d, k) {
  const [y, m, dd] = d.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + k, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(dd, last))
  return t.toISOString().slice(0, 10)
}
// Datele de plată: din `freq` în `freq` luni de la cumpărare, până la scadență (scadența e ultima plată)
export function couponDates(start, maturity, freq, horizon) {
  const step = FREQ_MONTHS[freq]
  if (!step || !start) return maturity ? [maturity] : []
  const end = maturity || horizon
  const out = []
  for (let k = 1; k < 600; k++) {
    const d = addMonthsISO(start, k * step)
    if (end && d >= end) break
    out.push(d)
  }
  if (maturity) out.push(maturity)
  return out
}
// Starea cupoanelor la o dată: ultima plată (sau cumpărarea), următoarea, cât vine, câte s-au plătit
export function couponInfo(amount, ratePct, start, maturity, freq, today) {
  if (!ratePct || !start || !freq || freq === 'maturity') return null
  const horizon = addMonthsISO(today, 24)
  const dates = couponDates(start, maturity, freq, horizon)
  let last = start, next = null, paid = 0
  for (const d of dates) { if (d <= today) { last = d; paid++ } else { next = d; break } }
  const nextAmount = next ? accruedInterest(amount, ratePct, last, next) : 0
  const paidTotal = Math.round(dates.filter((d) => d <= today).reduce((s, d, i, arr) => s + accruedInterest(amount, ratePct, i ? arr[i - 1] : start, d), 0) * 100) / 100
  return { last, next, nextAmount, paid, count: maturity ? dates.length : null, paidTotal, dates }
}
