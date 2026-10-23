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
