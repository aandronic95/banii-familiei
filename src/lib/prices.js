// Istoricul prețurilor din bonuri: același produs, la magazine diferite și în timp
export function productKey(name) {
  return String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b\d+([.,]\d+)?\s*(buc|pcs|x)\b/g, ' ')       // „2 buc”
    .replace(/[^\p{L}\p{N}%.,]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

// txs: [{ date, merchant, items: [{ name, qty, price, sum }] }]
export function priceIndex(txs) {
  const map = new Map()
  for (const x of txs) {
    if (!Array.isArray(x.items)) continue
    for (const it of x.items) {
      const key = productKey(it.name)
      if (!key || key.length < 2) continue
      const qty = Number(it.qty) || 1
      const unit = Number(it.price) > 0 ? Number(it.price) : Number(it.sum) / qty
      if (!(unit > 0)) continue
      let p = map.get(key)
      if (!p) map.set(key, (p = { key, name: it.name, points: [] }))
      p.points.push({ date: x.date, merchant: x.merchant || '', price: Math.round(unit * 100) / 100, qty, txId: x.id })
    }
  }
  const out = []
  for (const p of map.values()) {
    p.points.sort((a, b) => a.date.localeCompare(b.date))
    const prices = p.points.map((q) => q.price)
    const first = p.points[0], last = p.points[p.points.length - 1]
    p.count = p.points.length
    p.last = last.price
    p.lastDate = last.date
    p.min = Math.min(...prices)
    p.max = Math.max(...prices)
    p.change = first.price ? (last.price - first.price) / first.price : 0
    // cel mai ieftin magazin (ultimul preț văzut la fiecare)
    const byShop = {}
    for (const q of p.points) if (q.merchant) byShop[q.merchant] = q
    p.shops = Object.entries(byShop).map(([merchant, q]) => ({ merchant, price: q.price, date: q.date })).sort((a, b) => a.price - b.price)
    out.push(p)
  }
  return out.sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
}
