// Dorință cumpărată deja: ce cheltuială din ultimele luni e probabil ea (suma apropiată, numele, cât de recent)
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const words = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)
const DAY = 86400000

// txs: [{ id, kind, date, mdl, merchant, note, items }]; wish: { title, priceMdl, created_at }
export function wishCandidates(wish, txs, today, { days = 120, query = '' } = {}) {
  const tw = words(wish.title)
  const q = norm(query).trim()
  const from = Date.parse(today) - days * DAY
  const out = []
  for (const x of txs) {
    if (x.kind !== 'expense' || Date.parse(x.date) < from || Date.parse(x.date) > Date.parse(today) + DAY) continue
    const text = norm([x.merchant, x.note, ...(Array.isArray(x.items) ? x.items.map((i) => i.name) : [])].filter(Boolean).join(' '))
    if (q && !text.includes(q) && !String(x.mdl).includes(q.replace(',', '.'))) continue
    const hits = tw.filter((w) => text.includes(w.slice(0, Math.max(4, w.length - 2)))).length
    const byName = tw.length ? hits / tw.length : 0
    const byPrice = wish.priceMdl > 0 ? Math.max(0, 1 - (Math.abs(x.mdl - wish.priceMdl) / wish.priceMdl) * 4) : 0
    const byDate = Math.max(0, 1 - (Date.parse(today) - Date.parse(x.date)) / (days * DAY))
    // ce s-a cumpărat înainte de a pune dorința e mai puțin probabil
    const before = wish.created_at && x.date < String(wish.created_at).slice(0, 10) ? 0.5 : 1
    const score = (byPrice * 2 + byName * 1.5 + byDate * 0.5) * before
    out.push({ tx: x, score, byPrice, byName })
  }
  return out.sort((a, b) => b.score - a.score || b.tx.date.localeCompare(a.tx.date))
}
