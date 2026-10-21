<script setup>
import { reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, save, setRate, debtMdl } from '../store.js'
import { t, lang, setLang } from '../lib/i18n.js'
import { parseAmount, money0, daysUntil } from '../lib/format.js'
import { haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const notify = reactive({ loans: true, budget: true, weekly: true, car: true, ...(me.value?.notify || {}) })
const rates = reactive({ EUR: String(S.rates.EUR || '').replace('.', ','), USD: String(S.rates.USD || '').replace('.', ',') })
const carNote = computed(() => {
  const e = S.carEvents.filter((x) => !x.done && x.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  return e ? t('expiresIn', e.title, t('inDays', Math.max(0, daysUntil(e.due_date)))) : ''
})
const links = computed(() => [
  { to: '/credits', icon: 'bank', title: t('credits'), sub: debtMdl.value ? `${money0(debtMdl.value)} MDL ${t('toPay')}` : '' },
  { to: '/car', icon: 'car', title: t('carTitle'), sub: carNote.value },
  { to: '/budgets', icon: 'pie', title: t('budgets'), sub: '' },
  { to: '/transactions', icon: 'list', title: t('transactions'), sub: '' },
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
const items = [['loans', 'nLoans', 'nLoansSub'], ['budget', 'nBudget', 'nBudgetSub'], ['weekly', 'nWeekly', 'nWeeklySub'], ['car', 'nCar', 'nCarSub']]
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
      <p class="hint" style="margin: 0;">{{ t('rateAuto') }}</p>
    </section>

    <div class="cap" style="display: flex; gap: 6px; align-items: flex-start;">
      <Icon name="lock" :size="16" />
      <span>{{ t('security') }}</span>
    </div>
  </main>
</template>
