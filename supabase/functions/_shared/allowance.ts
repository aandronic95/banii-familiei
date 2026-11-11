// @ts-nocheck — copie identică a src/lib/allowance.js (testul verifică)
// Bani de buzunar: zilele (de la ultima plată, exclusiv, până azi, inclusiv) în care trebuia dați
// a: { amount, weekday (0 = duminică … 6), last (ISO sau null) }
export function allowanceDue(a, today) {
  if (!a || !(Number(a.amount) > 0)) return []
  const out = []
  const start = a.last ? Date.parse(a.last) + 86400000 : Date.parse(today) - 6 * 86400000
  for (let t = Math.max(start, Date.parse(today) - 35 * 86400000); t <= Date.parse(today); t += 86400000) {
    if (new Date(t).getUTCDay() === Number(a.weekday)) out.push(new Date(t).toISOString().slice(0, 10))
  }
  return a.last ? out : out.slice(-1)
}
