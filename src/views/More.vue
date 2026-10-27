<script setup>
import { reactive, computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, save, savePrefs, setRate, refreshRates, debtMdl, investMdl, debtsSummary } from '../store.js'
import { t, lang, setLang } from '../lib/i18n.js'
import { parseAmount, money0, daysUntil, todayISO, dateLong } from '../lib/format.js'
import { haptic, homeShortcutSupported, homeShortcutStatus, addHomeShortcut } from '../lib/telegram.js'
import { supabase } from '../lib/supabase.js'
import { bioState, requestBio, authenticate } from '../lib/biometric.js'
import { isLockEnabled, setLockEnabled, isBioEnabled, setBioEnabled, pinStatus, pinVerify, pinSet } from '../lib/lock.js'
import PinPad from '../components/PinPad.vue'
import { monthName } from '../lib/format.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
// Iconiță pe ecranul telefonului
const homeSt = ref(homeShortcutSupported() ? 'unknown' : 'unsupported')
homeShortcutStatus().then((st) => { homeSt.value = st })
function addHome() { if (!addHomeShortcut(() => { homeSt.value = 'added'; toast(t('homeAdded')) })) homeSt.value = 'unsupported' }
// Alerte de curs valutar: botul anunță când EUR/USD trece de un prag
const fxRules = computed(() => (Array.isArray(me.value?.prefs?.fx) ? me.value.prefs.fx : []))
const fxNew = reactive({ cur: 'EUR', op: '<', v: '' })
async function addFx() {
  const v = parseAmount(fxNew.v)
  if (!(v > 0)) return
  await savePrefs({ fx: [...fxRules.value, { cur: fxNew.cur, op: fxNew.op, v }].slice(0, 10) })
  fxNew.v = ''
  const now = S.rates[fxNew.cur]
  toast(now && (fxNew.op === '<' ? now < v : now > v) ? t('fxAlreadyTrue', fmtRate(now)) : t('fxSaved'))
}
async function delFx(i) { await savePrefs({ fx: fxRules.value.filter((_, k) => k !== i) }) }

// Pragul pentru „cheltuială mare” (MDL); 0 = oprit
const bigLimit = ref(me.value?.notify?.big ? String(me.value.notify.big) : '')
async function saveBig() {
  const v = Math.max(0, Math.round(parseAmount(bigLimit.value) || 0))
  notify.big = v
  bigLimit.value = v ? String(v) : ''
  await saveNotify()
  toast(v ? t('bigOn', money0(v)) : t('bigOff'))
}
const notify = reactive({ tasks: true, evening: true, loans: true, budget: true, weekly: true, car: true, invest: true, recurring: true, debts: true, monthly: true, backup: false, ...(me.value?.notify || {}) })

// Blocare: cod de rezervă obligatoriu + Face ID, dacă telefonul îl are
const lockOn = ref(isLockEnabled())
const bioOn = ref(isBioEnabled())
const bioAvail = ref(false)
bioState().then((st) => { bioAvail.value = st.available })
// Pașii foii cu tastatură: 'verify' (cod existent), 'new', 'repeat'
const sheet = reactive({ open: false, purpose: '', step: '', first: '', current: '', error: '', busy: false })
function openSheet(purpose, step) { Object.assign(sheet, { open: true, purpose, step, first: '', current: '', error: '', busy: false }) }
const closeSheet = () => { sheet.open = false }
const sheetTitle = computed(() => ({ verify: sheet.purpose === 'change' ? t('pinCurrent') : t('pinEnter'), new: sheet.purpose === 'change' ? t('pinNew') : t('pinSetTitle'), repeat: t('pinRepeat') })[sheet.step])
const errText = (r) => (r.error === 'locked' ? t('pinLockedFor', r.retryIn) : r.error === 'network' ? t('pinNetwork') : t('pinWrong', r.left))

async function finishEnable() {
  setLockEnabled(true); lockOn.value = true
  if (bioAvail.value && (await requestBio(t('lockPrompt'))) && (await authenticate(t('lockPrompt')))) { setBioEnabled(true); bioOn.value = true }
  closeSheet(); haptic('success'); toast(t('pinSaved'))
}

async function onLockToggle(e) {
  e.target.checked = lockOn.value // starea se schimbă doar după cod
  if (!lockOn.value) {
    const st = await pinStatus()
    if (st.error) { toast(t('pinNetwork')); return }
    openSheet('enable', st.hasPin ? 'verify' : 'new')
  } else {
    // Oprirea: Face ID sau codul
    if (bioOn.value && (await authenticate(t('lockPrompt')))) { setLockEnabled(false); lockOn.value = false; bioOn.value = false; return }
    openSheet('disable', 'verify')
  }
}
async function onBioToggle(e) {
  e.target.checked = bioOn.value
  if (!bioOn.value) {
    if ((await requestBio(t('lockPrompt'))) && (await authenticate(t('lockPrompt')))) { setBioEnabled(true); bioOn.value = true; haptic('success') }
  } else { setBioEnabled(false); bioOn.value = false }
}

async function onPin(pin) {
  sheet.error = ''
  if (sheet.step === 'verify') {
    sheet.busy = true
    const r = await pinVerify(pin)
    sheet.busy = false
    if (!r.ok) { sheet.error = errText(r); return }
    if (sheet.purpose === 'enable') return finishEnable()
    if (sheet.purpose === 'disable') { setLockEnabled(false); lockOn.value = false; bioOn.value = false; closeSheet(); return }
    if (sheet.purpose === 'change') { sheet.current = pin; sheet.step = 'new'; return }
  }
  if (sheet.step === 'new') { sheet.first = pin; sheet.step = 'repeat'; return }
  if (sheet.step === 'repeat') {
    if (pin !== sheet.first) { sheet.step = 'new'; sheet.first = ''; sheet.error = t('pinMismatch'); return }
    sheet.busy = true
    const r = await pinSet(pin, sheet.current || undefined)
    sheet.busy = false
    if (!r.ok) { sheet.error = errText(r); sheet.step = sheet.purpose === 'change' ? 'verify' : 'new'; return }
    if (sheet.purpose === 'enable') return finishEnable()
    closeSheet(); haptic('success'); toast(t('pinSaved'))
  }
}

// Raport PDF și export Excel, trimise de bot în Telegram
const months = (() => {
  const [y, m] = todayISO().split('-').map(Number)
  return [0, 1, 2, 3, 4, 5].map((k) => { const d = new Date(Date.UTC(y, m - 1 - k, 1)); return { v: d.toISOString().slice(0, 7), label: `${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}` } })
})()
const reportMonth = ref(months[Number(todayISO().slice(8, 10)) <= 5 ? 1 : 0].v)
const docBusy = ref('')
async function sendDoc(type) {
  if (docBusy.value) return
  docBusy.value = type
  try {
    const { data, error } = await supabase.functions.invoke(`docs?type=${type}`, { body: type === 'report' ? { month: reportMonth.value } : {} })
    if (error || !data?.ok) throw error || new Error('send')
    haptic('success'); toast(t(type === 'report' ? 'reportSent' : 'exportSent'))
  } catch (e) { console.error(e); toast(t('error', e)) } finally { docBusy.value = '' }
}
const fmtRate = (v) => (v ? String(v).replace('.', ',') : '')
const rates = reactive({ EUR: fmtRate(S.rates.EUR), USD: fmtRate(S.rates.USD) })
watch(() => [S.rates.EUR, S.rates.USD], ([e, u]) => { rates.EUR = fmtRate(e); rates.USD = fmtRate(u) })
const rateDate = ref(todayISO())
const pastRates = ref(null)
const rateBusy = ref(false)
async function loadBnm() {
  rateBusy.value = true
  pastRates.value = null
  try {
    const isToday = rateDate.value === todayISO() || !rateDate.value
    const r = await refreshRates(isToday ? undefined : rateDate.value)
    if (!r.rates?.EUR && !r.rates?.USD) toast(t('bnmFail'))
    else if (!isToday) pastRates.value = r
    else toast(t('saved'))
  } catch (e) { console.error(e); toast(t('bnmFail')) } finally { rateBusy.value = false }
}
const carNote = computed(() => {
  const e = S.carEvents.filter((x) => !x.done && x.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  return e ? t('expiresIn', e.title, t('inDays', Math.max(0, daysUntil(e.due_date)))) : ''
})
const links = computed(() => [
  { to: '/calendar', icon: 'clock', title: t('calendarTitle'), sub: t('calendarSub') },
  { to: '/goals', icon: 'piggy', title: t('goalsTitle'), sub: S.goals.length ? S.goals.map((g) => g.name).slice(0, 3).join(', ') : t('goalsSub') },
  { to: '/debts', icon: 'users', title: t('debtsTitle'), sub: debtsSummary.value.owed || debtsSummary.value.owe ? `+${money0(debtsSummary.value.owed)} / −${money0(debtsSummary.value.owe)} MDL` : t('debtsSub') },
  { to: '/credits', icon: 'bank', title: t('credits'), sub: debtMdl.value ? `${money0(debtMdl.value)} MDL ${t('toPay')}` : '' },
  { to: '/investments', icon: 'chart', title: t('investments'), sub: investMdl.value ? `${money0(investMdl.value)} MDL` : '' },
  { to: '/car', icon: 'car', title: t('carTitle'), sub: carNote.value },
  { to: '/recurring', icon: 'clock', title: t('recurringTitle'), sub: S.recurring.filter((r) => r.active).length ? S.recurring.filter((r) => r.active).map((r) => r.name).slice(0, 3).join(', ') : t('recurringSub') },
  { to: '/budgets', icon: 'pie', title: t('budgets'), sub: '' },
  { to: '/tasks', icon: 'check', title: t('tasksTitle'), sub: t('tasksSub') },
  { to: '/transactions', icon: 'list', title: t('transactions'), sub: '' },
  { to: '/apple-pay', icon: 'card', title: t('apTitle'), sub: t('apMenuSub') },
  { to: '/import', icon: 'list', title: t('importTitle'), sub: t('importSub') },
  { to: '/family', icon: 'users', title: t('family'), sub: S.members.map((m) => m.name).join(', ') },
  { to: '/history', icon: 'clock', title: t('histTitle'), sub: t('histSub') },
  { to: '/restore', icon: 'upload', title: t('rsTitle'), sub: t('rsSub') },
])

async function saveNotify() {
  if (!me.value) return
  await save('members', { id: me.value.id, notify: { ...notify } })
}
async function chooseLang(l) {
  setLang(l)
  haptic('light')
  if (me.value) save('members', { id: me.value.id, lang: l })
}
async function saveRate(c) {
  const v = parseAmount(rates[c])
  if (v > 0) { await setRate(c, v); toast(t('saved')) }
}
const items = [['loans', 'nLoans', 'nLoansSub'], ['budget', 'nBudget', 'nBudgetSub'], ['weekly', 'nWeekly', 'nWeeklySub'], ['car', 'nCar', 'nCarSub'], ['invest', 'nInvest', 'nInvestSub'], ['recurring', 'nRecurring', 'nRecurringSub'], ['debts', 'nDebts', 'nDebtsSub'], ['monthly', 'nMonthly', 'nMonthlySub'], ['backup', 'nBackup', 'nBackupSub'], ['evening', 'nEvening', 'nEveningSub'], ['tasks', 'nTasks', 'nTasksSub']]
</script>

<template>
  <main class="page">
    <h1 class="h-title">{{ t('more') }}</h1>

    <div class="bf-list">
      <button v-for="l in links" :key="l.to" type="button" class="bf-row bf-row--tap" @click="router.push(l.to)">
        <div class="bf-row__icon"><Icon :name="l.icon" /></div>
        <div class="bf-row__body"><div class="bf-row__title">{{ l.title }}</div><div v-if="l.sub" class="bf-row__sub">{{ l.sub }}</div></div>
        <span class="chev" aria-hidden="true">›</span>
      </button>
    </div>

    <section>
      <div class="bf-list__head">{{ t('notifications') }}</div>
      <div class="bf-list">
        <label v-for="[k, title, sub] in items" :key="k" class="bf-row" :for="'n-' + k">
          <div class="bf-row__body"><div class="bf-row__title">{{ t(title) }}</div><div class="bf-row__sub">{{ t(sub) }}</div></div>
          <input :id="'n-' + k" v-model="notify[k]" type="checkbox" class="sw" @change="saveNotify">
        </label>
        <div class="bf-row" style="align-items: center;">
          <div class="bf-row__body"><label for="n-big" class="bf-row__title">{{ t('bigTitle') }}</label><div class="bf-row__sub">{{ t('bigSub') }}</div></div>
          <input id="n-big" v-model="bigLimit" class="inp" inputmode="numeric" :placeholder="t('bigPh')" style="width: 104px; text-align: right;" @change="saveBig">
        </div>
      </div>
    </section>

    <section v-if="homeSt !== 'unsupported'">
      <div class="bf-list">
        <button type="button" class="bf-row bf-row--tap" :disabled="homeSt === 'added'" @click="addHome">
          <div class="bf-row__icon"><Icon name="plus" /></div>
          <div class="bf-row__body"><div class="bf-row__title">{{ t('homeTitle') }}</div><div class="bf-row__sub">{{ homeSt === 'added' ? t('homeDone') : t('homeSub') }}</div></div>
          <Icon v-if="homeSt === 'added'" name="tick" />
          <span v-else class="chev" aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <section>
      <div class="bf-list__head">{{ t('language') }}</div>
      <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
        <button type="button" :class="{ on: lang === 'ro' }" @click="chooseLang('ro')">Română</button>
        <button type="button" :class="{ on: lang === 'ru' }" @click="chooseLang('ru')">Русский</button>
      </div>
    </section>

    <section class="stack">
      <div class="bf-list__head" style="padding-bottom: 0;">{{ t('rates') }}</div>
      <div class="grid2">
        <div v-for="c in ['EUR', 'USD']" :key="c" class="fld">
          <label :for="'r-' + c">1 {{ c }} = MDL</label>
          <input :id="'r-' + c" v-model="rates[c]" class="inp" inputmode="decimal" @change="saveRate(c)">
        </div>
      </div>
      <p class="hint" style="margin: 0;">{{ S.rateDates.EUR ? t('rateFrom', dateLong(S.rateDates.EUR)) + ' ' : '' }}{{ t('rateAuto') }}</p>
      <div style="display: flex; gap: 8px;">
        <input v-model="rateDate" type="date" class="inp" :max="todayISO()" :aria-label="t('rateDate')" style="flex: 1;">
        <button type="button" class="bf-btn bf-btn--secondary" :disabled="rateBusy" @click="loadBnm">{{ t('bnmLoad') }}</button>
      </div>
      <div class="bf-card stack" style="padding: 12px 16px;">
        <div style="font-weight: 600;">{{ t('fxTitle') }}</div>
        <div v-for="(r, i) in fxRules" :key="i" class="kv">
          <span>1 {{ r.cur }} {{ r.op === '<' ? t('fxBelow') : t('fxAbove') }} <b>{{ fmtRate(r.v) }}</b> MDL</span>
          <button type="button" class="link" style="padding: 0;" @click="delFx(i)">{{ t('delete') }}</button>
        </div>
        <div style="display: grid; grid-template-columns: 76px 1fr 1fr auto; gap: 6px;">
          <select v-model="fxNew.cur" class="inp" :aria-label="t('fxCur')" style="padding: 0 8px;"><option>EUR</option><option>USD</option></select>
          <select v-model="fxNew.op" class="inp" :aria-label="t('fxDir')" style="padding: 0 8px;"><option value="<">{{ t('fxBelow') }}</option><option value=">">{{ t('fxAbove') }}</option></select>
          <input v-model="fxNew.v" class="inp" inputmode="decimal" :placeholder="S.rates[fxNew.cur] ? fmtRate(S.rates[fxNew.cur]) : '19,50'" :aria-label="t('fxValue')">
          <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 48px; padding: 0 14px;" :disabled="!(parseAmount(fxNew.v) > 0)" @click="addFx">{{ t('add') }}</button>
        </div>
        <p class="hint" style="margin: 0;">{{ t('fxHint') }}</p>
      </div>
      <div v-if="pastRates" class="bf-card stack" style="padding: 12px 16px;">
        <div class="cap">{{ t('rateFrom', dateLong(pastRates.date)) }}</div>
        <div v-for="(v, c) in pastRates.rates" :key="c" class="kv"><span>1 {{ c }}</span><b>{{ fmtRate(v) }} MDL</b></div>
      </div>
    </section>

    <section class="stack">
      <div class="bf-list__head" style="padding-bottom: 0;">{{ t('toolsTitle') }}</div>
      <div class="bf-card stack">
        <div class="sec-head"><div><h2 class="h-sec">{{ t('reportPdf') }}</h2><div class="cap">{{ t('reportPdfSub') }}</div></div><Icon name="chart" /></div>
        <div style="display: flex; gap: 8px;">
          <select v-model="reportMonth" class="inp" :aria-label="t('reportMonth')" style="flex: 1;"><option v-for="m in months" :key="m.v" :value="m.v">{{ m.label }}</option></select>
          <button type="button" class="bf-btn bf-btn--primary" :disabled="!!docBusy" @click="sendDoc('report')">{{ docBusy === 'report' ? '…' : t('reportSend') }}</button>
        </div>
      </div>
      <div class="bf-card stack">
        <div class="sec-head"><div><h2 class="h-sec">{{ t('exportTitle') }}</h2><div class="cap">{{ t('exportSub') }}</div></div><Icon name="list" /></div>
        <button type="button" class="bf-btn bf-btn--secondary" :disabled="!!docBusy" @click="sendDoc('export')">{{ docBusy === 'export' ? '…' : t('exportSend') }}</button>
      </div>
      <div class="bf-list">
        <label class="bf-row" for="lock-sw">
          <div class="bf-row__icon"><Icon name="lock" /></div>
          <div class="bf-row__body"><div class="bf-row__title">{{ t('lockTitle') }}</div><div class="bf-row__sub">{{ (bioAvail ? t('lockSubPin') : t('lockPinOnly')) + '. ' + t('lockThisDevice') }}</div></div>
          <input id="lock-sw" type="checkbox" class="sw" :checked="lockOn" @change="onLockToggle">
        </label>
        <label v-if="lockOn && bioAvail" class="bf-row" for="bio-sw">
          <div class="bf-row__icon"><Icon name="faceid" /></div>
          <div class="bf-row__body"><div class="bf-row__title">{{ t('lockUseBio') }}</div></div>
          <input id="bio-sw" type="checkbox" class="sw" :checked="bioOn" @change="onBioToggle">
        </label>
        <button v-if="lockOn" type="button" class="bf-row bf-row--tap" @click="openSheet('change', 'verify')">
          <div class="bf-row__icon"><Icon name="lock" /></div>
          <div class="bf-row__body"><div class="bf-row__title">{{ t('pinChange') }}</div></div>
          <span class="chev" aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <div v-if="sheet.open" class="sheet" role="dialog" aria-modal="true">
      <button type="button" class="bf-btn bf-btn--ghost sheet__close" @click="closeSheet">{{ t('cancel') }}</button>
      <div style="flex: 1; display: grid; place-items: center;">
        <PinPad :key="sheet.step" :title="sheetTitle" :sub="sheet.step === 'new' && sheet.purpose === 'enable' ? t('pinSetSub') : ''" :error="sheet.error" :busy="sheet.busy" @done="onPin" />
      </div>
    </div>

    <div class="cap" style="display: flex; gap: 6px; align-items: flex-start;">
      <Icon name="lock" :size="16" />
      <span>{{ t('security') }}</span>
    </div>
  </main>
</template>
