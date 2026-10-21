<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, totalMdl, debtMdl, periodSums, monthRange, budgetRows, loanStatuses } from '../store.js'
import { t } from '../lib/i18n.js'
import { money, money0, monthName, daysUntil, dateShort } from '../lib/format.js'
import TxRow from '../components/TxRow.vue'
import BudgetBar from '../components/BudgetBar.vue'
import Icon from '../components/Icon.vue'

const router = useRouter()
const now = new Date()
const title = `${monthName(now.getMonth())} ${now.getFullYear()}`
const month = computed(() => { const [a, b] = monthRange(); return periodSums(a, b) })
const recent = computed(() => [...S.transactions].sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at)).slice(0, 6))
const budgets = computed(() => [...budgetRows.value].sort((a, b) => b.pct - a.pct).slice(0, 4))
const adults = computed(() => S.members.filter((m) => m.role !== 'none'))

// Avertizări: rate în următoarele 5 zile și termene la mașină în 14 zile
const alerts = computed(() => {
  const out = []
  for (const l of S.loans) {
    if (l.closed) continue
    const n = loanStatuses.value[l.id]?.next
    if (!n) continue
    const d = daysUntil(n.due)
    if (d <= 5) out.push({ key: 'l' + l.id, danger: d < 0, text: `${l.name}: ${money0(n.payment)} ${l.currency}`, sub: d < 0 ? dateShort(n.due) : t('inDays', d), to: '/loan/' + l.id })
  }
  for (const e of S.carEvents) {
    if (e.done || !e.due_date) continue
    const d = daysUntil(e.due_date)
    if (d <= 14) out.push({ key: 'c' + e.id, danger: d < 0, text: e.title, sub: d < 0 ? dateShort(e.due_date) : t('inDays', d), to: '/car' })
  }
  return out
})
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <div>
        <div class="muted" style="font: 500 13px/18px var(--font-sans);">{{ t('hello') }}, {{ me?.name }}</div>
        <h1 class="h-title">{{ title }}</h1>
      </div>
      <div style="display: flex;">
        <span v-for="(m, i) in adults" :key="m.id" class="av" :style="{ width: '32px', height: '32px', fontSize: '13px', marginLeft: i ? '-6px' : 0, boxShadow: `inset 0 0 0 2px var(--person-${m.color}), 0 0 0 2px var(--bg)` }">{{ m.name.slice(0, 1).toUpperCase() }}</span>
      </div>
    </div>

    <button type="button" class="bf-card" style="border: 0; text-align: left; color: inherit; cursor: pointer;" @click="router.push('/accounts')">
      <div class="bf-balance__label">{{ t('availableAll') }}</div>
      <div class="bf-balance__amount">{{ money(totalMdl) }}<span class="bf-balance__cur">MDL</span></div>
      <div class="bf-balance__meta" style="flex-wrap: wrap;">
        <span>{{ t('month') }}: <b class="bf-income">+{{ money0(month.inc) }}</b></span>
        <span><b class="bf-expense">−{{ money0(month.exp) }}</b></span>
        <span v-if="debtMdl > 0">{{ t('debts') }}: <b>{{ money0(debtMdl) }}</b></span>
      </div>
    </button>

    <div v-if="alerts.length" class="stack">
      <button v-for="a in alerts" :key="a.key" type="button" class="bf-banner" :class="{ 'bf-banner--danger': a.danger }" style="border: 0; text-align: left; cursor: pointer;" @click="router.push(a.to)">
        <Icon name="alert" />
        <div><b>{{ a.text }}</b> · {{ a.sub }}</div>
      </button>
    </div>

    <section v-if="budgets.length" class="stack">
      <div class="sec-head"><h2 class="h-sec">{{ t('monthBudget') }}</h2><button class="link" @click="router.push('/budgets')">{{ t('all') }}</button></div>
      <div class="bf-card stack-lg">
        <BudgetBar v-for="r in budgets" :key="r.cat.id" :row="r" :show-note="r.state !== 'ok'" />
      </div>
    </section>

    <section class="stack">
      <div class="sec-head"><h2 class="h-sec">{{ t('recentTx') }}</h2><button class="link" @click="router.push('/transactions')">{{ t('all') }}</button></div>
      <div v-if="recent.length" class="bf-list">
        <TxRow v-for="x in recent" :key="x.id" :tx="x" />
      </div>
      <div v-else class="bf-card empty">{{ t('noTx') }}</div>
    </section>
  </main>
</template>
