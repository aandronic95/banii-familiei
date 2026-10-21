import { reactive, computed } from 'vue'
import { supabase } from './lib/supabase.js'
import { tg, inTelegram } from './lib/telegram.js'
import { loanStatus } from './lib/loan.js'
import { todayISO } from './lib/format.js'

export const S = reactive({
  status: 'loading', // loading | ready | not_telegram | not_allowed | invite_bad | error
  tgId: null,
  userId: null,
  family: null,
  members: [],
  accounts: [],
  categories: [],
  transactions: [],
  loans: [],
  loanPayments: [],
  cars: [],
  carEvents: [],
  rates: { MDL: 1 },
  rateDates: {},
})

const TABLES = {
  accounts: 'accounts', categories: 'categories', transactions: 'transactions', loans: 'loans',
  loan_payments: 'loanPayments', cars: 'cars', car_events: 'carEvents', members: 'members',
}

// ───────────── Autentificare prin Telegram ─────────────
export async function start() {
  S.status = 'loading'
  if (!inTelegram()) { S.status = 'not_telegram'; return }
  S.tgId = tg.initDataUnsafe?.user?.id ?? null
  const invite = new URLSearchParams(location.search).get('invite') || ''
  try {
    const { data, error } = await supabase.functions.invoke('tg-auth', { body: { initData: tg.initData, invite } })
    if (error) {
      let body = {}
      try { body = await error.context.json() } catch (_) {}
      if (body.error === 'not_allowed') { S.tgId = body.telegram_id ?? S.tgId; S.status = 'not_allowed'; return }
      if (body.error === 'invite_invalid') { S.status = 'invite_bad'; return }
      throw error
    }
    const { data: sess, error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
    if (e2) throw e2
    S.userId = sess.user.id
    if (invite) history.replaceState(null, '', location.pathname)
    await loadAll()
    subscribe()
    S.status = 'ready'
    if (S.rateDates.EUR !== todayISO() || S.rateDates.USD !== todayISO()) refreshRates().catch((e) => console.warn('curs BNM', e))
  } catch (e) {
    console.error(e)
    S.status = 'error'
  }
}

async function fetchAll(table, order = 'id') {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending: true }).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export async function loadAll() {
  const [fam, members, accounts, categories, transactions, loans, loanPayments, cars, carEvents, rates] = await Promise.all([
    supabase.from('families').select('*').limit(1).single(),
    fetchAll('members', 'created_at'),
    fetchAll('accounts', 'sort'),
    fetchAll('categories', 'sort'),
    fetchAll('transactions', 'date'),
    fetchAll('loans', 'created_at'),
    fetchAll('loan_payments', 'n'),
    fetchAll('cars', 'created_at'),
    fetchAll('car_events', 'created_at'),
    supabase.from('rates').select('*').order('date', { ascending: false }).limit(20),
  ])
  if (fam.error) throw fam.error
  Object.assign(S, { family: fam.data, members, accounts, categories, transactions, loans, loanPayments, cars, carEvents })
  for (const r of rates.data || []) {
    if (!S.rateDates[r.currency]) { S.rates[r.currency] = Number(r.rate); S.rateDates[r.currency] = r.date }
  }
}

let channel = null
function subscribe() {
  if (channel) supabase.removeChannel(channel)
  const fid = S.family.id
  channel = supabase.channel('family-' + fid)
  for (const [table, key] of Object.entries(TABLES)) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `family_id=eq.${fid}` }, (p) => {
      if (p.eventType === 'DELETE') removeLocal(key, p.old.id)
      else putLocal(key, p.new)
    })
  }
  channel.subscribe()
}

function putLocal(key, row) {
  const arr = S[key]
  const i = arr.findIndex((x) => x.id === row.id)
  if (i >= 0) arr.splice(i, 1, { ...arr[i], ...row })
  else arr.push(row)
}
function removeLocal(key, id) {
  const i = S[key].findIndex((x) => x.id === id)
  if (i >= 0) S[key].splice(i, 1)
}

// ───────────── Scriere ─────────────
export async function save(table, row) {
  const payload = { ...row, family_id: S.family.id }
  const q = row.id
    ? supabase.from(table).update(payload).eq('id', row.id).select().single()
    : supabase.from(table).insert(payload).select().single()
  const { data, error } = await q
  if (error) throw error
  putLocal(TABLES[table], data)
  return data
}

export async function remove(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
  removeLocal(TABLES[table], id)
}

export async function uploadReceipt(file) {
  const blob = await compressImage(file)
  const path = `${S.family.id}/${crypto.randomUUID ? crypto.randomUUID() : Date.now()}.jpg`
  const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}

export async function receiptUrl(path) {
  const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 600)
  return data?.signedUrl
}

async function compressImage(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.82))
  } catch (_) {
    return file
  }
}

// Cursul BNM prin server (browserul nu poate citi direct de pe bnm.md).
// Fără dată: cursul de azi, care devine și cursul folosit la conversii.
export async function refreshRates(date) {
  const { data, error } = await supabase.functions.invoke('rates', { body: date ? { date } : {} })
  if (error) throw error
  if (!date) {
    for (const [c, r] of Object.entries(data.rates || {})) { S.rates[c] = Number(r); S.rateDates[c] = data.date }
  }
  return data
}

export async function setRate(currency, rate) {
  const row = { currency, date: todayISO(), rate }
  const { error } = await supabase.from('rates').upsert(row)
  if (error) throw error
  S.rates[currency] = rate
  S.rateDates[currency] = row.date
}

// ───────────── Calcule ─────────────
export const toMdl = (amount, cur) => Number(amount) * (S.rates[cur] ?? 1)

export const me = computed(() => S.members.find((m) => m.user_id === S.userId) || null)
export const isOwner = computed(() => me.value?.role === 'owner')
export const memberById = (id) => S.members.find((m) => m.id === id)
export const accountById = (id) => S.accounts.find((a) => a.id === id)
export const categoryById = (id) => S.categories.find((c) => c.id === id)

export const balances = computed(() => {
  const b = Object.fromEntries(S.accounts.map((a) => [a.id, Number(a.opening_balance) || 0]))
  for (const t of S.transactions) {
    const v = Number(t.amount)
    if (t.kind === 'income') b[t.account_id] = (b[t.account_id] ?? 0) + v
    else b[t.account_id] = (b[t.account_id] ?? 0) - v
    if (t.kind === 'transfer' && t.to_account_id) b[t.to_account_id] = (b[t.to_account_id] ?? 0) + Number(t.to_amount ?? t.amount)
  }
  for (const k in b) b[k] = Math.round(b[k] * 100) / 100
  return b
})

export const activeAccounts = computed(() => S.accounts.filter((a) => !a.archived))

export const totalMdl = computed(() =>
  activeAccounts.value.reduce((s, a) => s + toMdl(balances.value[a.id] ?? 0, a.currency), 0))

export const totalsByCurrency = computed(() => {
  const o = { MDL: 0, EUR: 0, USD: 0 }
  for (const a of activeAccounts.value) o[a.currency] += balances.value[a.id] ?? 0
  return o
})

export const loanStatuses = computed(() =>
  Object.fromEntries(S.loans.map((l) => [l.id, loanStatus(l, S.loanPayments)])))

export const debtMdl = computed(() =>
  S.loans.filter((l) => !l.closed).reduce((s, l) => s + toMdl(loanStatuses.value[l.id].remaining, l.currency), 0))

export const txCurrency = (t) => accountById(t.account_id)?.currency || 'MDL'

// Sume într-o perioadă (în MDL); transferurile nu intră în venituri/cheltuieli
export function periodSums(from, to) {
  let inc = 0, exp = 0
  const byCat = {}, byMember = {}
  for (const t of S.transactions) {
    if (t.date < from || t.date > to || t.kind === 'transfer') continue
    const v = toMdl(t.amount, txCurrency(t))
    if (t.kind === 'income') inc += v
    else {
      exp += v
      const c = t.category_id || '-'
      byCat[c] = (byCat[c] || 0) + v
      const m = t.member_id || '-'
      byMember[m] = (byMember[m] || 0) + v
    }
  }
  return { inc, exp, byCat, byMember }
}

export function monthRange(d = todayISO()) {
  const [y, m] = d.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return [`${y}-${mm}-01`, `${y}-${mm}-${String(last).padStart(2, '0')}`]
}

export const budgetRows = computed(() => {
  const [from, to] = monthRange()
  const { byCat } = periodSums(from, to)
  return S.categories
    .filter((c) => c.kind === 'expense' && !c.archived && c.budget)
    .map((c) => {
      const spent = byCat[c.id] || 0, budget = Number(c.budget)
      return { cat: c, spent, budget, pct: spent / budget, state: spent > budget ? 'over' : spent >= 0.8 * budget ? 'warn' : 'ok' }
    })
})
