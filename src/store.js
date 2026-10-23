import { reactive, computed } from 'vue'
import { supabase } from './lib/supabase.js'
import { tg, inTelegram } from './lib/telegram.js'
import { loanStatus, nextOccurrence } from './lib/loan.js'
import { todayISO, uuid } from './lib/format.js'
import { cacheGet, cacheSet, cacheDel } from './lib/cache.js'
import { toast } from './components/Toast.js'
import { t as tr } from './lib/i18n.js'
import { accruedInterest, liveAccrued, perDay } from './lib/invest.js'
import { detectSubscriptions, suggestBudget } from './lib/insights.js'
import { schedule } from './lib/loan.js'

export const S = reactive({
  status: 'loading', // loading | ready | not_telegram | not_allowed | invite_bad | error
  errorText: '',
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
  investments: [],
  recurring: [],
  debts: [],
  goals: [],
  rates: { MDL: 1 },
  rateDates: {},
  offline: false,   // lucrăm din copia locală, fără server
  cachedAt: null,   // când au fost luate datele din copia locală
  pending: 0,       // modificări care așteaptă internetul
})

const TABLES = {
  accounts: 'accounts', categories: 'categories', transactions: 'transactions', loans: 'loans',
  loan_payments: 'loanPayments', cars: 'cars', car_events: 'carEvents', members: 'members', investments: 'investments', recurring: 'recurring', debts: 'debts', goals: 'goals',
}

// ───────────── Copia locală și coada offline ─────────────
const DATA_KEYS = ['family', 'members', 'accounts', 'categories', 'transactions', 'loans', 'loanPayments', 'cars', 'carEvents', 'investments', 'recurring', 'debts', 'goals']
const snapKey = () => 'snap:' + S.tgId
const queueKey = () => 'queue:' + S.tgId
let queue = []
let persistT = 0

function schedulePersist() {
  if (!S.tgId || !S.family) return
  clearTimeout(persistT)
  persistT = setTimeout(() => {
    const data = Object.fromEntries(DATA_KEYS.map((k) => [k, S[k]]))
    cacheSet(snapKey(), { userId: S.userId, at: Date.now(), data, rates: S.rates, rateDates: S.rateDates })
  }, 1200)
}
function persistQueue() { S.pending = queue.length; cacheSet(queueKey(), queue) }
async function forgetDevice() { await cacheDel(snapKey()); await cacheDel(queueKey()); queue = []; S.pending = 0 }

// Modificările din coadă se aplică peste datele aduse de pe server, ca să nu dispară de pe ecran
function applyQueueLocally() {
  for (const it of queue) {
    const key = TABLES[it.table]
    if (it.op === 'delete') removeLocal(key, it.id, false)
    else putLocal(key, { ...it.row, _pending: true }, false)
  }
}

const isNetErr = (e) => describeError(e) === 'offline'

// Trimite pe server ce s-a salvat fără internet, în ordine
export async function flushQueue() {
  const sentTx = []
  while (queue.length) {
    const it = queue[0]
    let res
    if (it.op === 'insert') res = await supabase.from(it.table).insert(it.row)
    else if (it.op === 'update') res = await supabase.from(it.table).update(it.row).eq('id', it.row.id)
    else res = await supabase.from(it.table).delete().eq('id', it.id)
    const err = res.error
    if (err && isNetErr(err)) throw err
    if (err && !(it.op === 'insert' && err.code === '23505')) { // 23505 = era deja salvat
      console.warn('nu s-a putut sincroniza', it, err)
      toast(tr('syncFailed'))
    } else if (it.table === 'transactions' && it.op === 'insert') sentTx.push(it.row)
    queue.shift()
    persistQueue()
  }
  if (sentTx.length) maybeAlert(sentTx)
}

let syncing = false
export async function syncNow() {
  if (syncing || !S.userId) return
  syncing = true
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) { syncing = false; return start() }
    await afterLogin()
  } catch (e) {
    if (!isNetErr(e)) console.warn('sincronizare', e)
  } finally { syncing = false }
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { if (S.offline || S.pending) syncNow() })

// ───────────── Autentificare prin Telegram ─────────────
export async function start() {
  S.status = 'loading'
  if (!inTelegram()) { S.status = 'not_telegram'; return }
  S.tgId = tg.initDataUnsafe?.user?.id ?? null
  const invite = new URLSearchParams(location.search).get('invite') || ''

  // Deschidere instant: arătăm imediat datele salvate pe telefon, apoi le actualizăm de pe server
  if (!invite && S.tgId) {
    queue = (await cacheGet(queueKey())) || []
    S.pending = queue.length
    const snap = await cacheGet(snapKey())
    if (snap?.data?.family) {
      Object.assign(S, snap.data, { userId: snap.userId, cachedAt: snap.at })
      Object.assign(S.rates, snap.rates || {}); Object.assign(S.rateDates, snap.rateDates || {})
      applyQueueLocally()
      S.status = 'ready'
    }
  }
  const fromCache = S.status === 'ready'

  try {
    // Refolosim sesiunea salvată dacă e a aceluiași cont Telegram.
    // Dacă accesul a fost scos între timp, RLS nu mai dă date și trecem la login complet.
    if (!invite && (await resumeSession())) return
    const { data, error } = await supabase.functions.invoke('tg-auth', { body: { initData: tg.initData, invite } })
    if (error) {
      let body = {}
      try { body = await error.context.json() } catch (_) {}
      if (body.error === 'not_allowed') { await forgetDevice(); S.tgId = body.telegram_id ?? S.tgId; S.status = 'not_allowed'; return }
      if (body.error === 'invite_invalid') { S.status = 'invite_bad'; return }
      throw error
    }
    const { data: sess, error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
    if (e2) throw e2
    S.userId = sess.user.id
    if (invite) history.replaceState(null, '', location.pathname)
    await afterLogin()
  } catch (e) {
    console.error(e)
    if (fromCache) { S.offline = true; return } // rămânem pe datele locale; reîncercăm când revine internetul
    S.errorText = describeError(e)
    S.status = 'error'
  }
}

async function resumeSession() {
  let u
  try {
    const { data } = await supabase.auth.getSession()
    u = data.session?.user
  } catch (_) { return false }
  if (!u || Number(u.user_metadata?.telegram_id) !== Number(S.tgId)) return false
  S.userId = u.id
  try {
    await afterLogin()
    return true
  } catch (e) {
    if (isNetErr(e)) throw e // fără internet: nu stricăm sesiunea
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    return false
  }
}

async function afterLogin() {
  await flushQueue()
  await loadAll()
  applyQueueLocally()
  subscribe()
  S.status = 'ready'
  S.offline = false
  S.cachedAt = null
  schedulePersist()
  if (S.rateDates.EUR !== todayISO() || S.rateDates.USD !== todayISO()) refreshRates().catch((e) => console.warn('curs BNM', e))
}

// Reîncarcă datele când aplicația revine în prim-plan (conexiunea live se poate pierde în fundal)
let lastLoad = 0
export async function refreshIfStale(maxAgeMs = 30000) {
  if (S.status !== 'ready') return
  if (S.offline || S.pending) return syncNow()
  if (Date.now() - lastLoad < maxAgeMs) return
  try { await loadAll(); applyQueueLocally(); subscribe(); schedulePersist() } catch (e) { console.warn('reîncărcare', e) }
}

export function describeError(e) {
  const msg = String(e?.message || e || '')
  if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed|Failed to send a request|FunctionsFetchError/i.test(msg)) return 'offline'
  return 'generic'
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
  const [fam, members, accounts, categories, transactions, loans, loanPayments, cars, carEvents, investments, recurring, debts, goals, rates] = await Promise.all([
    supabase.from('families').select('*').limit(1).single(),
    fetchAll('members', 'created_at'),
    fetchAll('accounts', 'sort'),
    fetchAll('categories', 'sort'),
    fetchAll('transactions', 'date'),
    fetchAll('loans', 'created_at'),
    fetchAll('loan_payments', 'n'),
    fetchAll('cars', 'created_at'),
    fetchAll('car_events', 'created_at'),
    fetchAll('investments', 'created_at'),
    fetchAll('recurring', 'next_date'),
    fetchAll('debts', 'created_at'),
    fetchAll('goals', 'created_at'),
    supabase.from('rates').select('*').order('date', { ascending: false }).limit(20),
  ])
  if (fam.error) throw fam.error
  lastLoad = Date.now()
  Object.assign(S, { family: fam.data, members, accounts, categories, transactions, loans, loanPayments, cars, carEvents, investments, recurring, debts, goals })
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

function putLocal(key, row, persist = true) {
  const arr = S[key]
  const i = arr.findIndex((x) => x.id === row.id)
  if (i >= 0) {
    const merged = { ...arr[i], ...row }
    if (!row._pending) delete merged._pending
    arr.splice(i, 1, merged)
  } else arr.push(row)
  if (persist) schedulePersist()
}
function removeLocal(key, id, persist = true) {
  const i = S[key].findIndex((x) => x.id === id)
  if (i >= 0) S[key].splice(i, 1)
  if (persist) schedulePersist()
}

// ───────────── Scriere ─────────────
// Fără internet, modificarea se salvează pe telefon și pleacă singură când revine conexiunea.
function saveOffline(table, payload) {
  const isNew = !payload.id
  const row = isNew ? { ...payload, id: uuid() } : payload
  if (isNew) queue.push({ op: 'insert', table, row })
  else {
    // dacă rândul încă așteaptă să fie trimis, îl actualizăm în coadă
    const q = queue.find((x) => x.op !== 'delete' && x.table === table && x.row.id === row.id)
    if (q) Object.assign(q.row, row)
    else queue.push({ op: 'update', table, row })
  }
  persistQueue()
  S.offline = true
  const local = isNew ? { created_at: new Date().toISOString(), created_by: S.userId, ...row, _pending: true } : { ...row, _pending: true }
  putLocal(TABLES[table], local)
  toast(tr('savedOffline'))
  return { ...local }
}

export async function save(table, row) {
  const payload = { ...row, family_id: S.family.id }
  if (S.offline || navigator.onLine === false) return saveOffline(table, payload)
  const q = row.id
    ? supabase.from(table).update(payload).eq('id', row.id).select().single()
    : supabase.from(table).insert(payload).select().single()
  const { data, error } = await q
  if (error) {
    if (isNetErr(error)) return saveOffline(table, payload)
    throw error
  }
  putLocal(TABLES[table], data)
  if (table === 'transactions' && !row.id) maybeAlert([data])
  return data
}

// Anunță ceilalți adulți despre o cheltuială mare (doar dacă cineva are pragul pornit)
function maybeAlert(rows) {
  const ids = rows.filter((r) => r.kind === 'expense').map((r) => r.id)
  if (!ids.length || !S.members.some((m) => Number(m.notify?.big) > 0 && m.user_id !== S.userId)) return
  supabase.functions.invoke('alert', { body: { ids } }).catch(() => {})
}

// Ce se poate „Anula” după ștergere (fără rânduri copil care s-ar pierde în cascadă)
const UNDOABLE = ['transactions', 'car_events', 'debts', 'goals', 'recurring', 'investments']

export async function remove(table, id, { onFinal } = {}) {
  const key = TABLES[table]
  const copy = S[key].find((x) => x.id === id)
  const pendingInsert = queue.findIndex((x) => x.op === 'insert' && x.table === table && x.row.id === id)
  if (pendingInsert >= 0) {
    // n-a ajuns încă pe server: îl scoatem doar din coadă
    queue = queue.filter((x) => !(x.table === table && (x.row?.id === id || x.id === id)))
    persistQueue()
  } else if (S.offline || navigator.onLine === false) {
    queue.push({ op: 'delete', table, id }); persistQueue(); S.offline = true
  } else {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      if (!isNetErr(error)) throw error
      queue.push({ op: 'delete', table, id }); persistQueue(); S.offline = true
    }
  }
  removeLocal(key, id)
  if (copy && UNDOABLE.includes(table)) {
    toast(tr('deletedOne'), { action: tr('undo'), ms: 6000, fn: () => restoreRow(table, copy).catch((e) => toast(tr('error', e))), onTimeout: onFinal })
  } else onFinal?.()
}

// Pune înapoi un rând șters (din „Anulează” sau din istoric), cu același ID
export async function restoreRow(table, row) {
  const clean = { ...row }
  delete clean._pending
  if (S.offline || navigator.onLine === false) {
    queue = queue.filter((x) => !(x.op === 'delete' && x.table === table && x.id === row.id))
    if (!S[TABLES[table]].some((x) => x.id === row.id)) queue.push({ op: 'insert', table, row: clean })
    persistQueue()
    putLocal(TABLES[table], { ...clean, _pending: true })
    return
  }
  const { data, error } = await supabase.from(table).insert(clean).select().single()
  if (error) throw error
  putLocal(TABLES[table], data)
  toast(tr('restored'))
}

export async function uploadReceipt(file) {
  const blob = await compressImage(file)
  // Dacă poza n-a putut fi convertită (ex. HEIC pe unele telefoane), se urcă așa cum e
  const type = blob.type || file.type || 'image/jpeg'
  const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[type] || 'jpg'
  const path = `${S.family.id}/${crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${ext}`
  const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: type })
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
    if (t.kind === 'income' || t.kind === 'divest') b[t.account_id] = (b[t.account_id] ?? 0) + v
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

// ───────────── Investiții ─────────────
export const ACCRUING = ['gov_bond', 'tbill', 'other']
const DAY = 86400000

// Dobânda acumulată: suma × rata × zile / 365 (ca la eVMS), până la scadență
export function investStatus(inv, today = todayISO()) {
  const amount = Number(inv.amount) || 0
  const end = inv.maturity_date && inv.maturity_date < today ? inv.maturity_date : today
  const days = Math.max(0, Math.round((Date.parse(end) - Date.parse(inv.start_date)) / DAY))
  const accrued = ACCRUING.includes(inv.kind) ? accruedInterest(amount, inv.rate, inv.start_date, end) : 0
  const received = S.transactions
    .filter((x) => x.investment_id === inv.id && x.kind === 'income')
    .reduce((s, x) => s + Number(x.amount) * (accountById(x.account_id)?.currency === inv.currency ? 1 : (S.rates[accountById(x.account_id)?.currency] ?? 1) / (S.rates[inv.currency] ?? 1)), 0)
  const returned = S.transactions.filter((x) => x.investment_id === inv.id && x.kind === 'divest')
    .reduce((s, x) => s + Number(x.amount), 0)
  const closed = inv.status === 'closed'
  const value = closed ? 0 : inv.current_value != null ? Number(inv.current_value) : ACCRUING.includes(inv.kind) ? amount + accrued : amount
  const total = inv.rate && inv.maturity_date && ACCRUING.includes(inv.kind)
    ? accruedInterest(amount, inv.rate, inv.start_date, inv.maturity_date)
    : null
  return { accrued, received, returned, value, closed, expectedAtMaturity: total, days }
}

export const investStatuses = computed(() => Object.fromEntries(S.investments.map((i) => [i.id, investStatus(i)])))
export const activeInvestments = computed(() => S.investments.filter((i) => i.status !== 'closed'))
export const investMdl = computed(() =>
  activeInvestments.value.reduce((s, i) => s + toMdl(investStatuses.value[i.id].value, i.currency), 0))
export const investedMdl = computed(() =>
  activeInvestments.value.reduce((s, i) => s + toMdl(i.amount, i.currency), 0))

// ───────────── Cifre „vii”: dobânda crește secundă cu secundă ─────────────
const msOf = (iso) => (iso ? Date.parse(iso) : null)
const liveAccrues = (inv) => ACCRUING.includes(inv.kind) && inv.rate && inv.current_value == null && inv.status !== 'closed'

export function liveInvestValue(inv, now = Date.now()) {
  const st = investStatuses.value[inv.id]
  if (!st || st.closed) return 0
  if (!liveAccrues(inv)) return st.value
  return Number(inv.amount) + liveAccrued(inv.amount, inv.rate, msOf(inv.start_date), msOf(inv.maturity_date), now)
}

// Depozite cu dobândă: estimare de la ultima dobândă primită (sau de la deschiderea contului)
const depositSince = computed(() => {
  const o = {}
  for (const a of S.accounts) {
    if (a.type !== 'deposit' || !a.interest_rate) continue
    let since = a.created_at ? Date.parse(a.created_at.slice(0, 10)) : Date.now()
    for (const x of S.transactions) if (x.account_id === a.id && x.kind === 'income') since = Math.max(since, Date.parse(x.date))
    o[a.id] = since
  }
  return o
})
export function depositLive(a, now = Date.now()) {
  const bal = balances.value[a.id] ?? 0
  const since = depositSince.value[a.id]
  if (!since || bal <= 0) return { accrued: 0, perDay: 0 }
  const end = msOf(a.maturity_date)
  return { accrued: liveAccrued(bal, a.interest_rate, since, end, now), perDay: end != null && end < now ? 0 : perDay(bal, a.interest_rate) }
}

// Totalul care „crește acum”, în MDL
export function growthAt(now = Date.now()) {
  let accrued = 0, daily = 0, invest = 0
  for (const i of activeInvestments.value) {
    const v = liveInvestValue(i, now)
    invest += toMdl(v, i.currency)
    if (!liveAccrues(i)) continue
    accrued += toMdl(v - Number(i.amount), i.currency)
    if (!i.maturity_date || msOf(i.maturity_date) > now) daily += toMdl(perDay(i.amount, i.rate), i.currency)
  }
  let deposit = 0
  for (const a of activeAccounts.value) {
    if (a.type !== 'deposit' || !a.interest_rate) continue
    const d = depositLive(a, now)
    deposit += toMdl(d.accrued, a.currency)
    daily += toMdl(d.perDay, a.currency)
  }
  return { accrued: accrued + deposit, deposit, perDay: daily, invest }
}

// ───────────── Cheltuieli pe zi ─────────────
const DAYMS = 86400000
const isoAdd = (iso, days) => new Date(Date.parse(iso) + days * DAYMS).toISOString().slice(0, 10)
export function monthsBack(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 - n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, last))
  return isoAdd(t.toISOString().slice(0, 10), 1)
}

// Sumele zilnice de cheltuieli (MDL) între from și to, inclusiv zilele fără cheltuieli
export function dailySpend(from, to, { noLoans = false } = {}) {
  const bank = new Set(S.categories.filter((c) => c.icon === 'bank').map((c) => c.id))
  const days = {}, byCat = {}
  for (let d = from; d <= to; d = isoAdd(d, 1)) days[d] = 0
  for (const x of S.transactions) {
    if (x.kind !== 'expense' || x.date < from || x.date > to) continue
    if (noLoans && (bank.has(x.category_id) || x.loan_id)) continue
    const v = toMdl(x.amount, txCurrency(x))
    days[x.date] += v
    const c = x.category_id || '-'
    byCat[c] = (byCat[c] || 0) + v
  }
  return { days, byCat }
}
export const firstTxDate = computed(() => S.transactions.reduce((m, x) => (!m || x.date < m ? x.date : m), null))

// ───────────── Averea netă în timp ─────────────
// Pentru o zi din trecut: soldurile conturilor din tranzacții, investițiile active atunci, restul creditelor după grafic.
// Cursul valutar e cel de azi, ca să se vadă evoluția reală, nu a cursului.
export function netWorthAt(iso) {
  const bal = {}
  for (const a of S.accounts) {
    const created = (a.created_at || '').slice(0, 10)
    bal[a.id] = !created || created <= iso ? Number(a.opening_balance) || 0 : 0
  }
  for (const x of S.transactions) {
    if (x.date > iso) continue
    const v = Number(x.amount)
    if (x.kind === 'income' || x.kind === 'divest') bal[x.account_id] = (bal[x.account_id] ?? 0) + v
    else bal[x.account_id] = (bal[x.account_id] ?? 0) - v
    if (x.kind === 'transfer' && x.to_account_id) bal[x.to_account_id] = (bal[x.to_account_id] ?? 0) + Number(x.to_amount ?? x.amount)
  }
  let assets = 0
  for (const a of S.accounts) assets += toMdl(bal[a.id] ?? 0, a.currency)

  let invest = 0
  for (const i of S.investments) {
    if (i.start_date > iso) continue
    if (i.status === 'closed' && (!i.maturity_date || i.maturity_date <= iso)) continue
    const end = i.maturity_date && i.maturity_date < iso ? i.maturity_date : iso
    const v = iso >= todayISO() ? (investStatuses.value[i.id]?.value ?? Number(i.amount))
      : Number(i.amount) + (ACCRUING.includes(i.kind) ? accruedInterest(i.amount, i.rate, i.start_date, end) : 0)
    invest += toMdl(v, i.currency)
  }

  let debt = 0
  for (const l of S.loans) {
    const sch = schedule(l)
    if (!sch.length) continue
    if (iso >= todayISO()) { if (!l.closed) debt += toMdl(loanStatuses.value[l.id]?.remaining ?? 0, l.currency); continue }
    const start = (l.created_at || '').slice(0, 10)
    // creditul luat înainte de a fi introdus în aplicație contează din prima rată
    if (sch[0].due > iso && start > iso) continue
    let rem = Number(l.principal)
    for (const x of sch) { if (x.due <= iso) rem = x.balance; else break }
    if (l.closed && rem <= 0) continue
    debt += toMdl(rem, l.currency)
  }
  return { assets, invest, debt, net: assets + invest - debt }
}

// Ultimele n luni: valoarea la sfârșitul fiecărei luni (luna curentă = azi)
export function netWorthSeries(n = 12) {
  const today = todayISO()
  const [y, m] = today.split('-').map(Number)
  const out = []
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - k, 0)) // ultima zi a lunii
    const iso = k === 0 ? today : d.toISOString().slice(0, 10)
    out.push({ iso, month: Number(iso.slice(5, 7)) - 1, ...netWorthAt(iso) })
  }
  const first = S.transactions.reduce((mn, x) => (!mn || x.date < mn ? x.date : mn), null)
  return out.filter((p) => !first || p.iso >= first.slice(0, 8) + '01' || p === out.at(-1))
}

// ───────────── Abonamente și bugete sugerate ─────────────
export const subscriptions = computed(() => {
  const rows = S.transactions.filter((x) => x.kind === 'expense' && x.merchant)
    .map((x) => ({ date: x.date, amount: toMdl(x.amount, txCurrency(x)), merchant: x.merchant, account_id: x.account_id, category_id: x.category_id }))
  const found = detectSubscriptions(rows, todayISO())
  const recNames = S.recurring.filter((r) => r.active !== false).map((r) => r.name.toLowerCase())
  return found.map((f) => ({ ...f, tracked: recNames.some((n) => n.includes(f.key.split(' ')[0]) || f.key.includes(n.split(' ')[0])) }))
})

// Pentru fiecare categorie de cheltuieli: media ultimelor 3 luni încheiate (doar lunile în care aveai deja date)
export function budgetSuggestions() {
  const today = todayISO()
  const [y, m] = today.split('-').map(Number)
  const first = S.transactions.reduce((mn, x) => (!mn || x.date < mn ? x.date : mn), null)
  const months = []
  for (let k = 3; k >= 1; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1)).toISOString().slice(0, 10)
    const [a, b] = monthRange(d)
    if (first && b >= first) months.push([a, b])
  }
  if (!months.length) return { months: 0, rows: [] }
  const rows = S.categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => {
    const totals = months.map(([a, b]) => S.transactions
      .filter((x) => x.kind === 'expense' && x.category_id === c.id && x.date >= a && x.date <= b)
      .reduce((s, x) => s + toMdl(x.amount, txCurrency(x)), 0))
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length
    return { cat: c, avg, suggested: suggestBudget(totals), current: Number(c.budget) || 0, loan: c.icon === 'bank' }
  }).filter((r) => r.suggested > 0).sort((a, b) => b.avg - a.avg)
  return { months: months.length, rows }
}

export const txCurrency = (t) => accountById(t.account_id)?.currency || 'MDL'

// Sume într-o perioadă (în MDL); transferurile nu intră în venituri/cheltuieli
export function periodSums(from, to) {
  let inc = 0, exp = 0
  const byCat = {}, byMember = {}
  for (const t of S.transactions) {
    if (t.date < from || t.date > to || !['income', 'expense'].includes(t.kind)) continue
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

// ───────────── Calendar: tot ce urmează între două date ─────────────
export function upcoming(from, to) {
  const ev = []
  for (const l of S.loans) {
    if (l.closed) continue
    const st = loanStatuses.value[l.id]
    for (const x of st.schedule) {
      if (x.due < from) continue
      if (x.due > to) break
      if (st.paid.has(x.n)) continue
      ev.push({ date: x.due, type: 'loan', title: l.name, amount: x.payment, currency: l.currency, sign: -1, to: '/credits' })
    }
  }
  for (const r of S.recurring) {
    if (!r.active) continue
    let d = r.next_date, guard = 0
    while (d <= to && guard++ < 40) {
      if (d >= from) ev.push({ date: d, type: 'rec', title: r.name, amount: Number(r.amount), currency: accountById(r.account_id)?.currency || 'MDL', sign: r.kind === 'income' ? 1 : -1, to: '/recurring/' + r.id, recurring: r })
      d = nextOccurrence(d, r.every_months, r.day_of_month)
    }
  }
  for (const e of S.carEvents) {
    if (e.done || !e.due_date || e.due_date < from || e.due_date > to) continue
    ev.push({ date: e.due_date, type: 'car', title: e.title, amount: e.amount ? Number(e.amount) : null, currency: 'MDL', sign: -1, to: '/car' })
  }
  for (const i of S.investments) {
    if (i.status === 'closed' || !i.maturity_date || i.maturity_date < from || i.maturity_date > to) continue
    ev.push({ date: i.maturity_date, type: 'inv', title: i.name + (i.code ? ' ' + i.code : ''), amount: Number(i.amount), currency: i.currency, sign: 1, to: '/investment/' + i.id })
  }
  for (const d of S.debts) {
    if (d.settled || !d.due_date || d.due_date < from || d.due_date > to) continue
    ev.push({ date: d.due_date, type: 'debt', title: d.person, amount: Number(d.amount) - Number(d.paid), currency: d.currency, sign: d.direction === 'we_owe' ? -1 : 1, to: '/debt/' + d.id })
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date) || a.sign - b.sign)
}

// Banii „la îndemână”: carduri și cash (fără depozite și conturi de investiții)
export const liquidMdl = computed(() =>
  activeAccounts.value.filter((a) => a.type === 'card' || a.type === 'cash').reduce((s, a) => s + toMdl(balances.value[a.id] ?? 0, a.currency), 0))

// Următorul salariu: plată recurentă de venit (categoria „Salariu” sau numele conține „salar”)
export const nextSalary = computed(() => {
  const cands = S.recurring.filter((r) => r.active && r.kind === 'income' && (/salar|зарплат/i.test(r.name) || categoryById(r.category_id)?.icon === 'wallet'))
  return cands.sort((a, b) => a.next_date.localeCompare(b.next_date))[0] || null
})

// ───────────── Datorii și obiective ─────────────
export const debtsSummary = computed(() => {
  let owed = 0, owe = 0
  for (const d of S.debts) {
    if (d.settled) continue
    const left = toMdl(Number(d.amount) - Number(d.paid), d.currency)
    if (d.direction === 'owed_to_us') owed += left; else owe += left
  }
  return { owed, owe }
})

export function goalProgress(g) {
  const saved = g.account_id ? (balances.value[g.account_id] ?? 0) : Number(g.saved) || 0
  const target = Number(g.target) || 1
  return { saved, target, pct: Math.max(0, Math.min(1, saved / target)), left: Math.max(0, target - saved) }
}
