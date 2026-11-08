// @ts-nocheck — copie identică a src/lib/salary.js (testul verifică)
// Împărțirea salariului: plățile până la următorul salariu, partea pentru economii și ce rămâne pe zi
// obligations: [{ date, name, amount }] (MDL, cheltuieli de plătit până la următorul salariu)
export function salaryPlan(amount, obligations, savePct, days) {
  const salary = Math.max(0, Number(amount) || 0)
  const list = [...obligations].sort((a, b) => a.date.localeCompare(b.date))
  const bills = Math.round(list.reduce((s, o) => s + Number(o.amount), 0) * 100) / 100
  const save = Math.round(salary * (Math.max(0, Math.min(50, Number(savePct) || 0)) / 100))
  const rest = Math.round((salary - bills - save) * 100) / 100
  const d = Math.max(1, Number(days) || 30)
  return { salary, bills, list, save, rest, days: d, perDay: rest > 0 ? Math.floor(rest / d) : 0, short: rest < 0 ? -rest : 0 }
}
// E salariu? (categoria cu portofel, plata recurentă „Salariu”, sau cuvântul în descriere) — și destul de mare
export const isSalaryTx = (x, catIcon, recName) =>
  x.kind === 'income' && Number(x.mdl ?? x.amount) >= 1000 && (catIcon === 'wallet' || /salar|зарплат|аванс/i.test([recName, x.merchant, x.note].filter(Boolean).join(' ')))
