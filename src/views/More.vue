<script setup>
import { reactive, computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, save, setRate, refreshRates, debtMdl, investMdl, debtsSummary } from '../store.js'
import { t, lang, setLang } from '../lib/i18n.js'
import { parseAmount, money0, daysUntil, todayISO, dateLong } from '../lib/format.js'
import { haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const notify = reactive({ loans: true, budget: true, weekly: true, car: true, invest: true, recurring: true, debts: true, ...(me.value?.notify || {}) })
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
  { to: '/transactions', icon: 'list', title: t('transactions'), sub: '' },
  { to: '/apple-pay', icon: 'card', title: t('apTitle'), sub: t('apMenuSub') },
  { to: '/import', icon: 'list', title: t('importTitle'), sub: t('importSub') },
  { to: '/family', icon: 'users', title: t('family'), sub: S.members.map((m) => m.name).join(', ') },
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
const items = [['loans', 'nLoans', 'nLoansSub'], ['budget', 'nBudget', 'nBudgetSub'], ['weekly', 'nWeekly', 'nWeeklySub'], ['car', 'nCar', 'nCarSub'], ['invest', 'nInvest', 'nInvestSub'], ['recurring', 'nRecurring', 'nRecurringSub'], ['debts', 'nDebts', 'nDebtsSub']]
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
      <div v-if="pastRates" class="bf-card stack" style="padding: 12px 16px;">
        <div class="cap">{{ t('rateFrom', dateLong(pastRates.date)) }}</div>
        <div v-for="(v, c) in pastRates.rates" :key="c" class="kv"><span>1 {{ c }}</span><b>{{ fmtRate(v) }} MDL</b></div>
      </div>
    </section>

    <div class="cap" style="display: flex; gap: 6px; align-items: flex-start;">
      <Icon name="lock" :size="16" />
      <span>{{ t('security') }}</span>
    </div>
  </main>
</template>
