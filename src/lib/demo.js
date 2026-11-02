// Modul demo: o familie inventată, ca aplicația să poată fi arătată cuiva fără date reale.
// Nimic nu pleacă pe server: clientul Supabase e înlocuit cu unul care lucrează doar în memorie.

const DAY = 86400000
const iso = (t) => new Date(t).toISOString().slice(0, 10)

// Generator de numere „aleatoare” repetabile (aceeași demonstrație la fiecare deschidere)
function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

export function demoData(today) {
  const t0 = Date.parse(today)
  const d = (k) => iso(t0 - k * DAY)
  const r = rng(20261102)
  const pick = (a) => a[Math.floor(r() * a.length)]
  const F = 'demo-family', U = 'demo-user'
  const base = { family_id: F }
  const members = [
    { ...base, id: 'dm1', user_id: U, telegram_id: 1, name: 'Ion', kind: 'adult', role: 'owner', color: 1, lang: null, notify: {}, prefs: {}, created_at: '2026-01-01' },
    { ...base, id: 'dm2', user_id: 'demo-u2', telegram_id: 2, name: 'Maria', kind: 'adult', role: 'editor', color: 2, lang: null, notify: {}, prefs: {}, created_at: '2026-01-02' },
    { ...base, id: 'dm3', user_id: null, telegram_id: null, name: 'Ana', kind: 'child', role: 'none', color: 3, lang: null, notify: {}, prefs: {}, created_at: '2026-01-03' },
  ]
  const acc = (id, name, type, currency, opening_balance, extra = {}) => ({ ...base, id, name, type, currency, opening_balance, archived: false, member_id: null, bank: null, last4: null, sort: 0, created_at: '2026-01-01', ...extra })
  const accounts = [
    acc('da1', 'MAIB Visa', 'card', 'MDL', 8200, { member_id: 'dm2', bank: 'MAIB', last4: '4821', sort: 1 }),
    acc('da2', 'MICB Mastercard', 'card', 'MDL', 15400, { member_id: 'dm1', bank: 'MICB', last4: '1093', sort: 2 }),
    acc('da3', 'Portofel', 'cash', 'MDL', 2300, { sort: 3 }),
    acc('da4', 'Cash euro', 'cash', 'EUR', 450, { sort: 4 }),
    acc('da5', 'Depozit MAIB', 'deposit', 'MDL', 40000, { bank: 'MAIB', interest_rate: 5.5, sort: 5 }),
    acc('da6', 'Apartament', 'asset', 'MDL', 1350000, { asset_kind: 'property', depreciation: 0, value_date: '2026-01-01', sort: 6 }),
  ]
  const cat = (id, kind, ro, ru, icon, budget = null, extra = {}) => ({ ...base, id, kind, name_ro: ro, name_ru: ru, icon, budget, sort: Number(id.slice(2)), archived: false, bucket: null, for_member_id: null, ...extra })
  const categories = [
    cat('dc1', 'expense', 'Mâncare', 'Продукты', 'cart', 7500),
    cat('dc2', 'expense', 'Mașină', 'Машина', 'car', 3000),
    cat('dc3', 'expense', 'Copilul', 'Ребёнок', 'school', 2500, { for_member_id: 'dm3' }),
    cat('dc4', 'expense', 'Utilități', 'Коммунальные', 'bolt', 2500),
    cat('dc5', 'expense', 'Casă', 'Дом', 'home', 1500),
    cat('dc6', 'expense', 'Sănătate', 'Здоровье', 'heart', 1000),
    cat('dc7', 'expense', 'Haine', 'Одежда', 'shirt', 1500),
    cat('dc8', 'expense', 'Distracții', 'Развлечения', 'ticket', 1500),
    cat('dc9', 'expense', 'Rate credite', 'Платежи по кредитам', 'bank'),
    cat('dc10', 'expense', 'Cadouri', 'Подарки', 'gift'),
    cat('dc11', 'income', 'Salariu', 'Зарплата', 'wallet'),
    cat('dc12', 'income', 'Alte venituri', 'Другие доходы', 'percent'),
  ]
  const transactions = []
  let n = 0
  const tx = (k, kind, amount, account_id, category_id, member_id, extra = {}) => transactions.push({
    ...base, id: 'dtx' + ++n, kind, amount: Math.round(amount * 100) / 100, account_id, category_id, member_id, date: d(k), created_at: d(k) + 'T10:00:00Z', created_by: U,
    merchant: null, note: null, receipt_path: null, car_id: null, car_kind: null, fuel_liters: null, odometer: null, full_tank: null, to_account_id: null, to_amount: null,
    investment_id: null, tags: [], split_id: null, fiscal_ref: null, items: null, for_member_id: null, ...extra,
  })
  const shops = ['Linella', 'Nr1', 'Kaufland', 'Fidesco', 'Piața Centrală']
  const prices = { 'Lapte 2.5% 1L': 19.9, 'Pâine albă': 7.5, 'Ouă 10 buc': 27, 'Brânză de vaci 400g': 42, 'Banane 1kg': 32, 'Cafea boabe 1kg': 289 }
  let odo = 152000
  for (let k = 120; k >= 0; k--) {
    const day = new Date(t0 - k * DAY)
    const dom = day.getUTCDate(), dow = day.getUTCDay()
    if (dom === 5) tx(k, 'income', 16500, 'da2', 'dc11', 'dm1', { merchant: 'Salariu' })
    if (dom === 10) tx(k, 'income', 12800, 'da1', 'dc11', 'dm2', { merchant: 'Salariu' })
    if (dom === 24) tx(k, 'expense', 6366.97, 'da2', 'dc9', 'dm1', { merchant: 'Credit ipotecar' })
    if (dom === 15) tx(k, 'expense', 1700 + r() * 900, 'da2', 'dc4', 'dm1', { merchant: 'Gaz și lumină' })
    if (dom === 6) tx(k, 'expense', 250, 'da2', 'dc4', 'dm1', { merchant: 'Internet Starnet' })
    if (dom === 1) tx(k, 'expense', 600, 'da1', 'dc3', 'dm2', { merchant: 'Grădinița' })
    if (k % 9 === 3) { odo += 420 + Math.round(r() * 120); tx(k, 'expense', 850 + r() * 150, pick(['da2', 'da3']), 'dc2', 'dm1', { merchant: 'Petrom', car_id: 'dcar1', car_kind: 'fuel', fuel_liters: 37 + Math.round(r() * 60) / 10, odometer: odo, full_tank: true }) }
    if (r() < 0.75) {
      const shop = pick(shops)
      const items = Object.entries(prices).filter(([name]) => r() < (name.startsWith('Cafea') ? 0.08 : 0.45)).map(([name, p]) => {
        const price = Math.round(p * (1 + (120 - k) * 0.0006 + (shop === 'Kaufland' ? -0.05 : shop === 'Nr1' ? 0.04 : 0)) * 100) / 100
        const qty = name.startsWith('Lapte') && r() < 0.4 ? 2 : 1
        return { name, qty, price, sum: Math.round(price * qty * 100) / 100 }
      })
      const extra = Math.round((60 + r() * (dow === 6 ? 700 : 300)) * 100) / 100
      const sum = items.reduce((s, x) => s + x.sum, 0) + extra
      tx(k, 'expense', sum, pick(['da1', 'da1', 'da3']), 'dc1', pick(['dm1', 'dm2']), { merchant: shop, items: items.length ? items : null })
    }
    if (r() < 0.12) tx(k, 'expense', 120 + r() * 600, 'da1', pick(['dc5', 'dc6', 'dc7', 'dc8']), pick(['dm1', 'dm2']), { merchant: pick(['Farmacia Familiei', 'Jysk', 'Cinema Patria', 'Zara', 'Andy\'s Pizza']) })
    if (r() < 0.06) tx(k, 'expense', 200 + r() * 500, 'da1', 'dc3', 'dm2', { merchant: pick(['Cerc de dans', 'Rechizite', 'Haine copii']) })
    if (dow === 0 && r() < 0.4) tx(k, 'expense', 45, 'da3', 'dc8', 'dm1', { merchant: 'Cafea' })
  }
  // o călătorie în desfășurare, cu cheltuieli în euro
  const tripStart = d(2), tripEnd = d(-4)
  tx(2, 'expense', 380, 'da4', 'dc5', 'dm1', { merchant: 'Hotel Sofia', tags: ['bulgaria'] })
  tx(1, 'expense', 64, 'da4', 'dc1', 'dm2', { merchant: 'Taverna', tags: ['bulgaria'] })
  tx(0, 'expense', 1450, 'da2', 'dc2', 'dm1', { merchant: 'Benzină OMV', tags: ['bulgaria'], car_id: 'dcar1', car_kind: 'fuel', fuel_liters: 45, odometer: odo + 600, full_tank: true })

  const firstDue = (() => { const x = new Date(t0); x.setUTCMonth(x.getUTCMonth() - 40); x.setUTCDate(24); return iso(x) })()
  return {
    family: { id: F, name: 'Familia Demo', base_currency: 'MDL', created_at: '2026-01-01' },
    userId: U,
    members, accounts, categories, transactions,
    loans: [{ ...base, id: 'dl1', name: 'Credit ipotecar', type: 'mortgage', bank: 'MAIB', currency: 'MDL', principal: 750000, annual_rate: 8.2, term_months: 240, first_due: firstDue, paid_before: 40, monthly_payment: null, account_id: 'da2', closed: false, created_at: '2026-01-01' }],
    loanPayments: [],
    cars: [{ ...base, id: 'dcar1', name: 'Skoda Octavia', plate: 'ABC 123', odometer_start: 151500, created_at: '2026-01-01' }],
    carEvents: [{ ...base, id: 'dce1', car_id: 'dcar1', kind: 'rca', title: 'RCA', due_date: d(-18), due_km: null, amount: 1200, done: false, created_at: '2026-01-01' },
      { ...base, id: 'dce2', car_id: 'dcar1', kind: 'service', title: 'Schimb ulei', due_date: null, due_km: odo + 2500, amount: 900, done: false, created_at: '2026-01-01' }],
    investments: [
      { ...base, id: 'dv1', kind: 'gov_bond', platform: 'eVMS', name: 'Obligațiuni de stat', code: 'MD4004002722', amount: 20000, units: 200, rate: 7.45, start_date: d(60), maturity_date: d(-670), coupon_freq: 'semiannual', currency: 'MDL', status: 'active', member_id: 'dm1', account_id: 'da2', current_value: null, value_date: null, note: null, created_at: d(60) },
      { ...base, id: 'dv2', kind: 'tbill', platform: 'Licitație BNM', name: 'Valori mobiliare 182 zile', code: null, amount: 10000, units: null, rate: 6.9, start_date: d(40), maturity_date: d(-142), coupon_freq: 'maturity', currency: 'MDL', status: 'active', member_id: 'dm2', account_id: 'da1', current_value: null, value_date: null, note: null, created_at: d(40) },
      { ...base, id: 'dv3', kind: 'p2p', platform: 'Fagura', name: 'Împrumut business', code: '102611105904', amount: 150, units: null, rate: 13.9, start_date: d(90), maturity_date: d(-1700), coupon_freq: 'monthly', currency: 'EUR', status: 'active', member_id: 'dm1', account_id: null, current_value: null, value_date: null, note: null, created_at: d(90) },
    ],
    recurring: [
      { ...base, id: 'dr1', kind: 'expense', name: 'Internet Starnet', amount: 250, account_id: 'da2', category_id: 'dc4', member_id: 'dm1', every_months: 1, day_of_month: 6, next_date: nextDom(today, 6), auto_add: true, confirm: true, workday: 'none', remind: true, active: true, created_at: '2026-01-01' },
      { ...base, id: 'dr2', kind: 'income', name: 'Salariu Ion', amount: 16500, account_id: 'da2', category_id: 'dc11', member_id: 'dm1', every_months: 1, day_of_month: 5, next_date: nextDom(today, 5), auto_add: true, confirm: true, workday: 'before', remind: true, active: true, created_at: '2026-01-01' },
      { ...base, id: 'dr3', kind: 'expense', name: 'Netflix', amount: 9.99, account_id: 'da1', category_id: 'dc8', member_id: 'dm2', every_months: 1, day_of_month: 18, next_date: nextDom(today, 18), auto_add: true, remind: false, active: true, created_at: '2026-01-01' },
    ],
    debts: [{ ...base, id: 'dd1', direction: 'owed_to_us', person: 'Vasile', amount: 2000, paid: 500, currency: 'MDL', date: d(50), due_date: d(-9), member_id: 'dm1', note: null, settled: false, created_at: d(50) }],
    goals: [{ ...base, id: 'dg1', name: 'Vacanță la mare', target: 30000, currency: 'MDL', account_id: null, saved: 12500, member_id: null, deadline: d(-240), icon: 'globe', done: false, created_at: d(100) }],
    templates: [{ ...base, id: 'dtp1', name: 'Cafea', kind: 'expense', amount: 45, account_id: 'da3', category_id: 'dc8', member_id: 'dm1', merchant: 'Cafea', car_id: null, car_kind: null, tags: [], sort: 1, created_at: '2026-01-01' }],
    tasks: [
      { ...base, id: 'dk1', title: 'Du mașina la revizie', kind: 'task', assignee_id: 'dm1', due_date: d(-2), due_time: null, repeat: 'none', repeat_every: 1, amount: null, category_id: null, account_id: null, steps: [{ t: 'Sună la service', done: true }, { t: 'Ia actele', done: false }], note: null, done: false, done_at: null, done_by: null, tx_id: null, sort: 0, created_at: d(3) + 'T10:00:00Z', created_by: U },
      { ...base, id: 'dk2', title: 'Plătește lumina', kind: 'money', assignee_id: 'dm2', due_date: d(-3), due_time: null, repeat: 'monthly', repeat_every: 1, amount: 450, category_id: 'dc4', account_id: 'da1', steps: [], note: null, done: false, done_at: null, done_by: null, tx_id: null, sort: 0, created_at: d(3) + 'T10:00:00Z', created_by: U },
    ],
    taskComments: [],
    shopping: [{ ...base, id: 'ds1', name: 'Lapte', qty: '2', price: null, done: false, done_at: null, created_by: U, created_at: d(0) + 'T08:00:00Z' }, { ...base, id: 'ds2', name: 'Pâine', qty: null, price: null, done: false, done_at: null, created_by: U, created_at: d(0) + 'T08:01:00Z' }],
    meters: [{ ...base, id: 'dmt1', name: 'Lumină', kind: 'electricity', unit: 'kWh', tariff: 2.86, reminder_day: 25, sort: 1, archived: false, created_at: '2026-01-01' }],
    readings: [0, 1, 2, 3, 4].map((i) => ({ ...base, id: 'drd' + i, meter_id: 'dmt1', date: d(150 - i * 30), value: 9200 + i * 205 + Math.round(r() * 30), note: null, created_at: d(150 - i * 30) })),
    wishes: [{ ...base, id: 'dw1', title: 'Mașină de spălat vase', price: 9000, currency: 'MDL', priority: 1, link: null, member_id: null, note: null, goal_id: null, done: false, done_at: null, created_at: d(20) },
      { ...base, id: 'dw2', title: 'Bicicletă', price: 150, currency: 'EUR', priority: 3, link: null, member_id: 'dm3', note: null, goal_id: null, done: false, done_at: null, created_at: d(25) }],
    events: [{ ...base, id: 'dev1', title: 'Mama', kind: 'birthday', date: '1962-' + d(-6).slice(5), has_year: true, yearly: true, member_id: null, gift_budget: 800, remind_days: 7, note: null, created_at: d(30) },
      { ...base, id: 'dev2', title: 'Ana', kind: 'birthday', date: '2020-' + d(-75).slice(5), has_year: true, yearly: true, member_id: 'dm3', gift_budget: 1500, remind_days: 14, note: null, created_at: d(30) }],
    trips: [{ ...base, id: 'dtr1', name: 'Bulgaria', tag: 'bulgaria', start_date: tripStart, end_date: tripEnd, currency: 'EUR', budget: 1200, plan: [{ category_id: 'dc5', amount: 600 }, { category_id: 'dc1', amount: 300 }, { category_id: 'dc2', amount: 150 }], people: 3, auto_tag: true, note: null, created_at: d(20) }],
  }
}

function nextDom(today, dom) {
  const [y, m, dd] = today.split('-').map(Number)
  const x = dd < dom ? new Date(Date.UTC(y, m - 1, dom)) : new Date(Date.UTC(y, m, dom))
  return iso(x.getTime())
}

// Client Supabase fals: citirile întorc datele din memorie, scrierile „reușesc” fără să plece nicăieri
export function demoClient(S, TABLES) {
  const uid = () => 'demo-' + Math.random().toString(36).slice(2, 10)
  const builder = (table) => {
    let op = 'select', payload = null, single = false
    const filters = []
    const run = () => {
      const key = TABLES[table]
      const rows = key ? S[key] : table === 'families' ? [S.family] : []
      if (op === 'select') {
        const out = (rows || []).filter((x) => filters.every(([c, v]) => x[c] === v))
        return { data: single ? out[0] ?? null : out, error: null }
      }
      if (op === 'delete') return { data: null, error: null }
      const now = new Date().toISOString()
      const one = (p) => {
        if (op === 'update') {
          const id = filters.find(([c]) => c === 'id')?.[1] ?? p.id
          const cur = (rows || []).find((x) => x.id === id) || {}
          return { ...cur, ...p, id }
        }
        return { created_at: now, created_by: S.userId, ...p, id: p.id || uid() }
      }
      const data = Array.isArray(payload) ? payload.map(one) : one(payload || {})
      return { data: single && Array.isArray(data) ? data[0] : data, error: null }
    }
    const b = {
      select() { return b }, insert(p) { op = 'insert'; payload = p; return b }, upsert(p) { op = 'insert'; payload = p; return b },
      update(p) { op = 'update'; payload = p; return b }, delete() { op = 'delete'; return b },
      eq(c, v) { filters.push([c, v]); return b }, single() { single = true; return b }, maybeSingle() { single = true; return b },
      then(ok, bad) { return Promise.resolve(run()).then(ok, bad) },
    }
    for (const m of ['neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'contains', 'ilike', 'like', 'or', 'filter', 'match']) b[m] = () => b
    return b
  }
  const ch = { on() { return ch }, subscribe() { return ch }, unsubscribe() { return Promise.resolve() } }
  return {
    from: builder,
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ch,
    removeChannel: () => Promise.resolve(),
    functions: { invoke: () => Promise.resolve({ data: { ok: true, demo: true }, error: null }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ data: {}, error: null }), createSignedUrl: () => Promise.resolve({ data: { signedUrl: '' }, error: null }), remove: () => Promise.resolve({ data: null, error: null }) }) },
  }
}
