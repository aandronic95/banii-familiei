// Verificarea datelor: lucrurile care strică rapoartele fără să se vadă
//  • dubluri: aceeași sumă, același cont, aceeași zi (± 1), de ex. adăugată manual și din import/Apple Pay
//  • transferuri înregistrate ca venit + cheltuială (ex. alimentarea Revolut din cardul MAIB),
//    care umflă și veniturile, și cheltuielile
const DAY = 86400000
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9а-я]+/gi, ' ').trim()
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY

// txs: [{ id, kind, amount, account_id, date, merchant, split_id, recurring_id, loan_id }]
export function findDuplicates(txs, { ignored = [] } = {}) {
  const skip = new Set(ignored)
  const list = txs.filter((x) => (x.kind === 'expense' || x.kind === 'income') && !x.split_id)
  const by = {}
  for (const x of list) (by[`${x.kind}|${x.account_id}|${Number(x.amount).toFixed(2)}`] ??= []).push(x)
  const out = []
  for (const g of Object.values(by)) {
    if (g.length < 2) continue
    g.sort((a, b) => a.date.localeCompare(b.date) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1], b = g[i]
      if (days(a.date, b.date) > 1) continue
      const ma = norm(a.merchant), mb = norm(b.merchant)
      // descrieri diferite de ambele părți = probabil două cumpărături reale (ex. două cafele)
      if (ma && mb && ma !== mb && !ma.includes(mb) && !mb.includes(ma)) continue
      // plăți recurente diferite sau rate diferite nu sunt dubluri
      if ((a.recurring_id && b.recurring_id && a.recurring_id !== b.recurring_id) || (a.loan_id && b.loan_id && a.loan_id !== b.loan_id)) continue
      const key = [a.id, b.id].sort().join('+')
      if (skip.has(key)) continue
      out.push({ key, keep: a, dup: b })
    }
  }
  return out.sort((x, y) => y.dup.date.localeCompare(x.dup.date))
}

// Cheltuială pe un cont + venit pe alt cont al vostru, aceeași sumă (în MDL, ±1%), la cel mult 2 zile distanță
export function findHiddenTransfers(txs, toMdl, { ignored = [] } = {}) {
  const skip = new Set(ignored)
  const exp = txs.filter((x) => x.kind === 'expense' && !x.split_id && !x.loan_id && !x.recurring_id)
  const inc = txs.filter((x) => x.kind === 'income' && !x.investment_id && !x.recurring_id)
  const used = new Set()
  const out = []
  for (const e of exp) {
    const ev = toMdl(e)
    if (!(ev >= 50)) continue // sumele mici nu contează și dau potriviri întâmplătoare
    const m = inc.find((i) => !used.has(i.id) && i.account_id !== e.account_id && days(i.date, e.date) <= 2 && Math.abs(toMdl(i) - ev) <= ev * 0.01 + 0.5)
    if (!m) continue
    const key = [e.id, m.id].sort().join('+')
    if (skip.has(key)) continue
    used.add(m.id)
    out.push({ key, out: e, in: m })
  }
  return out.sort((x, y) => y.out.date.localeCompare(x.out.date))
}
