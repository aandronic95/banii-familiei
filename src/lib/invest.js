// Dobânda acumulată simplă, ca la eVMS: suma × rata × zile / 365
const DAY = 86400000
export function accruedInterest(amount, ratePct, startISO, endISO) {
  if (!ratePct || !startISO || !endISO) return 0
  const days = Math.max(0, Math.round((Date.parse(endISO) - Date.parse(startISO)) / DAY))
  return Math.round(Number(amount) * (Number(ratePct) / 100) * (days / 365) * 100) / 100
}
