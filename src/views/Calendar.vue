<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { upcoming, liquidMdl, nextSalary, toMdl } from '../store.js'
import { t } from '../lib/i18n.js'
import { money, money0, dateLong, todayISO, monthName, daysUntil } from '../lib/format.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const today = todayISO()
const offset = ref(0) // 0 = luna curentă
const range = computed(() => {
  const [y, m] = today.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + offset.value, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
  const from = offset.value === 0 ? today : first.toISOString().slice(0, 10)
  return { from, to: last.toISOString().slice(0, 10), label: `${monthName(first.getUTCMonth())} ${first.getUTCFullYear()}` }
})
const events = computed(() => upcoming(range.value.from, range.value.to))
const days = computed(() => {
  const out = []
  for (const e of events.value) {
    const last = out[out.length - 1]
    if (last && last.date === e.date) last.items.push(e)
    else out.push({ date: e.date, items: [e] })
  }
  return out
})
const totals = computed(() => {
  let out = 0, inn = 0
  for (const e of events.value) if (e.amount) (e.sign < 0 ? (out += toMdl(e.amount, e.currency)) : (inn += toMdl(e.amount, e.currency)))
  return { out, inn }
})

// Până la salariu: disponibil acum minus ce trebuie plătit înainte
const salary = computed(() => {
  const s = nextSalary.value
  if (!s) return null
  const due = upcoming(today, s.next_date).filter((e) => e.sign < 0 && e.date < s.next_date && e.amount).reduce((a, e) => a + toMdl(e.amount, e.currency), 0)
  const left = liquidMdl.value - due
  const d = Math.max(1, daysUntil(s.next_date))
  return { date: s.next_date, days: daysUntil(s.next_date), due, left, perDay: left / d }
})

const ICON = { loan: 'bank', rec: 'clock', car: 'car', inv: 'chart', debt: 'users' }
const LABEL = { loan: 'calLoan', rec: 'calRec', car: 'calCar', inv: 'calInv', debt: 'calDebt' }
</script>

<template>
  <main class="page">
    <h1 class="h-title">{{ t('calendarTitle') }}</h1>

    <div v-if="salary" class="bf-card stack">
      <div class="bf-balance__label">{{ t('untilSalary', salary.days <= 0 ? t('inDays', 0) : t('inDays', salary.days)) }} · {{ dateLong(salary.date) }}</div>
      <div class="bf-balance__amount" :class="salary.left < 0 ? 'bf-expense' : ''">{{ money0(salary.left) }}<span class="bf-balance__cur">MDL</span></div>
      <div class="kv"><span class="muted">{{ t('availableNow') }}</span><b>{{ money0(liquidMdl) }} MDL</b></div>
      <div class="kv"><span class="muted">{{ t('dueBefore') }}</span><b class="bf-expense">−{{ money0(salary.due) }} MDL</b></div>
      <div v-if="salary.left > 0" class="hint">{{ t('perDay', money0(salary.perDay)) }}</div>
    </div>
    <div v-else class="bf-banner" style="background: var(--surface-2);">
      <Icon name="wallet" />
      <div>{{ t('untilSalaryNone') }} <button type="button" class="link" style="padding: 0;" @click="router.push('/recurring/new')">{{ t('newRecurring') }}</button></div>
    </div>

    <div class="sec-head">
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px; padding: 0 14px;" :disabled="offset === 0" :aria-label="t('back')" @click="offset--">‹</button>
      <h2 class="h-sec">{{ range.label }}</h2>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px; padding: 0 14px;" aria-label="›" @click="offset++">›</button>
    </div>
    <div v-if="events.length" class="kv">
      <span class="bf-expense">−{{ money0(totals.out) }} MDL</span>
      <span v-if="totals.inn" class="bf-income">+{{ money0(totals.inn) }} MDL</span>
    </div>

    <div v-if="!events.length" class="bf-card empty">{{ t('nothingThisMonth') }}</div>
    <section v-for="d in days" :key="d.date">
      <div class="bf-list__head">{{ dateLong(d.date) }}{{ d.date === today ? ' · ' + t('inDays', 0) : '' }}</div>
      <div class="bf-list">
        <button v-for="(e, i) in d.items" :key="i" type="button" class="bf-row bf-row--tap" @click="router.push(e.to)">
          <div class="bf-row__icon" :style="e.type === 'loan' ? 'background: var(--danger-soft); color: var(--danger);' : ''"><Icon :name="ICON[e.type]" /></div>
          <div class="bf-row__body"><div class="bf-row__title">{{ e.title }}</div><div class="bf-row__sub">{{ t(LABEL[e.type]) }}{{ e.recurring && !e.recurring.auto_add ? ' · ' + t('remindDay').toLowerCase() : '' }}</div></div>
          <div v-if="e.amount" class="bf-row__amount" :class="e.sign < 0 ? 'bf-expense' : 'bf-income'">{{ e.sign < 0 ? '−' : '+' }}{{ money(e.amount) }}<small>{{ e.currency }}</small></div>
        </button>
      </div>
    </section>
  </main>
</template>
