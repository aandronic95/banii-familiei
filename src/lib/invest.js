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
