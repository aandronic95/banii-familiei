// Luna asta față de trecuta, categorii propuse pentru tranzacțiile fără categorie, bani de buzunar. Fără dependențe (testabil).
import { merchantKey } from './insights.js'

const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
const dim = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }

// txs: cheltuieli [{ date, mdl, category_id }]. Comparăm aceleași zile: 1–11 nov. cu 1–11 oct.
export function monthCompare(txs, today) {
  const ym = today.slice(0, 7), pm = prevMonth(ym)
  const day = Math.min(Number(today.slice(8, 10)), dim(pm))
  const lim = `${pm}-${String(day).padStart(2, '0')}`
  const cur = {}, prev = {}
  let a = 0, b = 0
  for (const x of txs) {
    const c = x.category_id || '-'
    if (x.date.startsWith(ym) && x.date <= today) { cur[c] = (cur[c] || 0) + x.mdl; a += x.mdl }
    else if (x.date.startsWith(pm) && x.date <= lim) { prev[c] = (prev[c] || 0) + x.mdl; b += x.mdl }
  }
  const rows = [...new Set([...Object.keys(cur), ...Object.keys(prev)])]
    .map((c) => ({ category_id: c === '-' ? null : c, cur: cur[c] || 0, prev: prev[c] || 0, diff: (cur[c] || 0) - (prev[c] || 0) }))
    .filter((r) => Math.abs(r.diff) >= 50)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
  return { cur: a, prev: b, diff: a - b, pct: b > 0 ? (a - b) / b : null, day, rows }
}

// Categorii propuse: după ce categorie au avut alte tranzacții de la același magazin (majoritatea), altfel după cuvinte
// uncat / known: [{ id, kind, merchant, category_id }]; guess(text) → category_id sau null
export function suggestCategories(uncat, known, guess = () => null) {
  const votes = {}
  for (const x of known) {
    if (!x.category_id) continue
    const k = x.kind + ':' + merchantKey(x.merchant)
    if (k.endsWith(':')) continue
    votes[k] ??= {}
    votes[k][x.category_id] = (votes[k][x.category_id] || 0) + 1
  }
  const out = []
  for (const x of uncat) {
    const v = votes[x.kind + ':' + merchantKey(x.merchant)]
    let cat = null, sure = false
    if (v) {
      const top = Object.entries(v).sort((p, q) => q[1] - p[1])
      const total = top.reduce((s, e) => s + e[1], 0)
      if (top[0][1] / total >= 0.6) { cat = top[0][0]; sure = top[0][1] >= 2 }
    }
    if (!cat) cat = guess([x.merchant, x.note].filter(Boolean).join(' '), x.kind)
    if (cat) out.push({ tx: x, category_id: cat, sure })
  }
  return out
}

export { allowanceDue } from './allowance.js'
