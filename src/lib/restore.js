// Restaurare din backup-ul Excel: transformă rândurile din foaia „Tranzacții” în tranzacții noi,
// fără să dubleze ce există deja (după ID sau după dată + sumă + cont + descriere).
const H = {
  date: ['Data', 'Дата'], kind: ['Tip', 'Тип'], amount: ['Suma', 'Сумма'], account: ['Cont', 'Счёт'], to: ['În contul', 'На счёт'],
  category: ['Categorie', 'Категория'], member: ['Cine', 'Кто'], merchant: ['Magazin / descriere', 'Магазин / описание'],
  note: ['Notă', 'Заметка'], liters: ['Litri', 'Литры'], km: ['Km', 'Км'], tags: ['Etichete', 'Метки'], id: ['ID'],
}
const KINDS = {
  'Cheltuială': 'expense', 'Расход': 'expense', 'Venit': 'income', 'Доход': 'income', 'Transfer': 'transfer', 'Перевод': 'transfer',
  'Spre investiție': 'invest', 'В инвестицию': 'invest', 'Din investiție': 'divest', 'Из инвестиции': 'divest',
}
const pick = (r, k) => { for (const h of H[k]) if (h in r && r[h] !== '') return r[h]; return '' }
const low = (s) => String(s ?? '').trim().toLowerCase()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const txSheet = (sheets) => sheets['Tranzacții'] || sheets['Операции'] || null

function toISO(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10) // dată Excel
  const s = String(v).trim()
  let m
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`
  if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
export const dedupKey = (x) => [x.date, Math.abs(Number(x.amount)).toFixed(2), x.account_id, low(x.merchant)].join('|')

export function planRestore(rows, { accounts, categories, members, transactions }) {
  const accBy = Object.fromEntries(accounts.map((a) => [low(a.name), a]))
  const catBy = {}
  for (const c of categories) { catBy[c.kind + ':' + low(c.name_ro)] = c; catBy[c.kind + ':' + low(c.name_ru)] = c }
  const memBy = Object.fromEntries(members.map((m) => [low(m.name), m]))
  const ids = new Set(transactions.map((x) => x.id))
  const keys = new Set(transactions.map(dedupKey))
  const insert = [], skipped = []
  let dup = 0
  for (const r of rows) {
    const kind = KINDS[String(pick(r, 'kind')).trim()]
    const date = toISO(pick(r, 'date'))
    const amount = Math.abs(Number(String(pick(r, 'amount')).replace(/\s/g, '').replace(',', '.')))
    const acc = accBy[low(pick(r, 'account'))]
    if (!kind || !date || !(amount > 0)) { skipped.push({ r, why: 'bad' }); continue }
    if (!acc) { skipped.push({ r, why: 'account', name: pick(r, 'account') }); continue }
    const id = String(pick(r, 'id')).trim()
    if (id && ids.has(id)) { dup++; continue }
    const row = {
      kind, date, amount, account_id: acc.id,
      merchant: String(pick(r, 'merchant')).trim() || null, note: String(pick(r, 'note')).trim() || null,
    }
    if (keys.has(dedupKey(row))) { dup++; continue }
    if (kind === 'transfer') {
      const to = accBy[low(pick(r, 'to'))]
      if (!to) { skipped.push({ r, why: 'account', name: pick(r, 'to') }); continue }
      row.to_account_id = to.id
    }
    const cat = catBy[(kind === 'income' ? 'income' : 'expense') + ':' + low(pick(r, 'category'))]
    if (cat && (kind === 'income' || kind === 'expense')) row.category_id = cat.id
    const mem = memBy[low(pick(r, 'member'))]
    if (mem) row.member_id = mem.id
    const l = Number(String(pick(r, 'liters')).replace(',', '.')), km = parseInt(pick(r, 'km'))
    if (l > 0) row.fuel_liters = l
    if (km > 0) row.odometer = km
    const tags = String(pick(r, 'tags')).split(/\s+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean).slice(0, 8)
    if (tags.length) row.tags = tags
    if (UUID.test(id)) row.id = id
    keys.add(dedupKey(row))
    insert.push(row)
  }
  return { insert, dup, skipped }
}
