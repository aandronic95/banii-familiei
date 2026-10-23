// Analize fără dependențe (testabile): abonamente găsite automat și bugete sugerate
const DAY = 86400000

// „NETFLIX.COM 1234” și „Netflix” → „netflix”
export function merchantKey(m) {
  return String(m || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(srl|s\.r\.l|sa|ii|ics|ооо|llc|ltd|inc|com|www|md)\b/g, ' ')
    .replace(/[^a-zа-я ]+/gi, ' ')
    .trim().split(/\s+/).filter((w) => w.length > 1).slice(0, 3).join(' ')
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Plăți care se repetă lunar, cu sumă aproape aceeași.
// txs: [{ date, amount (MDL), merchant, account_id, category_id }] — doar cheltuieli
export function detectSubscriptions(txs, today) {
  const since = new Date(Date.parse(today) - 400 * DAY).toISOString().slice(0, 10)
  const groups = {}
  for (const x of txs) {
    if (x.date < since || x.date > today) continue
    const k = merchantKey(x.merchant)
    if (k.length < 3) continue
    ;(groups[k] ??= []).push(x)
  }
  const out = []
  for (const [key, list] of Object.entries(groups)) {
    list.sort((a, b) => a.date.localeCompare(b.date))
    // o singură plată pe lună contează (dacă sunt două în aceeași lună, nu e abonament clasic)
    const byMonth = {}
    for (const x of list) (byMonth[x.date.slice(0, 7)] ??= []).push(x)
    const months = Object.keys(byMonth)
    if (months.length < 3) continue
    if (Object.values(byMonth).some((v) => v.length > 1) && months.length < list.length * 0.8) continue
    const amounts = list.map((x) => Number(x.amount))
    const med = median(amounts)
    if (!(med > 0)) continue
    const close = amounts.filter((a) => Math.abs(a - med) <= Math.max(med * 0.2, 5)).length
    if (close / amounts.length < 0.75) continue
    const gaps = []
    for (let i = 1; i < list.length; i++) gaps.push((Date.parse(list[i].date) - Date.parse(list[i - 1].date)) / DAY)
    const g = median(gaps)
    if (g < 24 || g > 38) continue
    const last = list.at(-1)
    if ((Date.parse(today) - Date.parse(last.date)) / DAY > 45) continue // s-a oprit
    out.push({
      key,
      name: last.merchant,
      monthly: Math.round(med * 100) / 100,
      yearly: Math.round(med * 12),
      count: list.length,
      lastDate: last.date,
      day: Number(last.date.slice(8, 10)),
      account_id: last.account_id,
      category_id: last.category_id,
    })
  }
  return out.sort((a, b) => b.yearly - a.yearly)
}

// Buget propus din cheltuielile lunare: media, rotunjită în sus la 100 (sau 50 pentru sume mici)
export function suggestBudget(monthTotals) {
  const v = monthTotals.filter((x) => x > 0)
  if (!v.length) return 0
  const avg = monthTotals.reduce((s, x) => s + x, 0) / monthTotals.length
  const step = avg < 1000 ? 50 : 100
  return Math.ceil(avg / step) * step
}
