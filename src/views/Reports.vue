<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, periodSums, categoryById, memberById, totalMdl, debtMdl, investMdl, monthRange } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money0, todayISO, monthShort, dateShort } from '../lib/format.js'
import DailySpend from '../components/DailySpend.vue'
import SpendCalendar from '../components/SpendCalendar.vue'
import NetWorth from '../components/NetWorth.vue'
import Subscriptions from '../components/Subscriptions.vue'
import Projects from '../components/Projects.vue'
import DataCheck from '../components/DataCheck.vue'

const router = useRouter()
const period = ref('month')
const today = todayISO()

const range = computed(() => {
  if (period.value === 'week') return [new Date(Date.parse(today) - 6 * 86400000).toISOString().slice(0, 10), today]
  if (period.value === 'year') return [`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`]
  return monthRange(today)
})
const sums = computed(() => periodSums(...range.value))
const rangeLabel = computed(() => `${dateShort(range.value[0], true)} – ${dateShort(range.value[1] > today ? today : range.value[1], true)}`)

// Ultimele 6 luni
const months = computed(() => {
  const [y, m] = today.split('-').map(Number)
  const out = []
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1))
    const iso = d.toISOString().slice(0, 10)
    const s = periodSums(...monthRange(iso))
    out.push({ label: monthShort(d.getUTCMonth()), inc: s.inc, exp: s.exp })
  }
  const max = Math.max(1, ...out.map((x) => Math.max(x.inc, x.exp)))
  return out.map((x) => ({ ...x, hi: Math.round((x.inc / max) * 116), he: Math.round((x.exp / max) * 116) }))
})

const cats = computed(() => {
  const rows = Object.entries(sums.value.byCat).map(([id, v]) => ({ id, v, cat: categoryById(id) })).sort((a, b) => b.v - a.v)
  const max = rows[0]?.v || 1
  return rows.map((r) => ({ ...r, label: r.cat ? catName(r.cat) : t('noCategory'), pct: Math.round((r.v / (sums.value.exp || 1)) * 100), w: Math.round((r.v / max) * 100) }))
})
const people = computed(() => {
  const rows = Object.entries(sums.value.byMember).map(([id, v]) => ({ id, v, m: memberById(id) })).sort((a, b) => b.v - a.v)
  return rows.map((r) => ({ ...r, pct: (r.v / (sums.value.exp || 1)) * 100 }))
})
const aria = computed(() => months.value.map((m) => `${m.label}: +${money0(m.inc)} / −${money0(m.exp)}`).join('; '))
</script>

<template>
  <main class="page">
    <h1 class="h-title">{{ t('reports') }}</h1>
    <div class="bf-chips">
      <button v-for="p in ['week', 'month', 'year']" :key="p" type="button" class="bf-chip" :class="{ 'bf-chip--on': period === p }" @click="period = p">{{ t(p) }}</button>
    </div>

    <DataCheck />

    <div class="bf-card stack">
      <h2 class="h-sec">{{ t('incomeVsExpense') }}</h2>
      <div style="display: flex; gap: 16px;"><span class="lg"><i style="background: var(--income);"></i>{{ t('incomes') }}</span><span class="lg"><i style="background: var(--expense);"></i>{{ t('expenses') }}</span></div>
      <div role="img" :aria-label="aria" style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; align-items: end; height: 140px;">
        <div v-for="m in months" :key="m.label" style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
          <div style="display: flex; gap: 3px; align-items: flex-end; height: 116px;">
            <div :style="{ width: '12px', height: Math.max(2, m.hi) + 'px', borderRadius: '4px 4px 2px 2px', background: 'var(--income)' }"></div>
            <div :style="{ width: '12px', height: Math.max(2, m.he) + 'px', borderRadius: '4px 4px 2px 2px', background: 'var(--expense)' }"></div>
          </div>
          <span class="cap">{{ m.label }}</span>
        </div>
      </div>
      <div class="kv"><span class="muted">{{ t('incomes') }}</span><b class="bf-income">+{{ money0(sums.inc) }} MDL</b></div>
      <div class="kv"><span class="muted">{{ t('expenses') }}</span><b class="bf-expense">−{{ money0(sums.exp) }} MDL</b></div>
      <div class="kv"><span class="muted">{{ t('savedIn') }}</span><b :class="sums.inc - sums.exp >= 0 ? 'bf-income' : 'bf-expense'">{{ sums.inc - sums.exp >= 0 ? '+' : '' }}{{ money0(sums.inc - sums.exp) }} MDL</b></div>
      <p class="hint" style="margin: 0;">{{ t('ieHint', rangeLabel) }}</p>
    </div>

    <DailySpend />

    <SpendCalendar />

    <div v-if="cats.length" class="bf-card stack-lg">
      <div class="sec-head"><h2 class="h-sec">{{ t('byCategory') }}</h2><span class="cap">{{ money0(sums.exp) }} MDL</span></div>
      <button v-for="c in cats" :key="c.id" type="button" style="all: unset; cursor: pointer; display: block;" @click="router.push({ path: '/transactions', query: c.cat ? { category: c.id } : { uncat: '1' } })">
        <div class="bf-budget__top"><span class="bf-budget__name" style="font-size: 14px;">{{ c.label }}</span><span class="bf-budget__nums">{{ money0(c.v) }} · {{ c.pct }}%</span></div>
        <div class="bf-bar" style="height: 6px; margin-top: 6px;"><i :style="{ width: c.w + '%' }"></i></div>
      </button>
    </div>

    <div v-if="people.length" class="bf-card stack">
      <h2 class="h-sec">{{ t('byPerson') }}</h2>
      <div role="img" :aria-label="people.map((p) => `${p.m?.name || '—'} ${Math.round(p.pct)}%`).join(', ')" style="display: flex; height: 12px; border-radius: 999px; overflow: hidden; gap: 2px;">
        <div v-for="p in people" :key="p.id" :style="{ width: p.pct + '%', background: p.m ? `var(--person-${p.m.color})` : 'var(--ink-muted)' }"></div>
      </div>
      <div v-for="p in people" :key="p.id" class="kv"><span><span :class="p.m ? `bf-dot bf-p${p.m.color}` : 'bf-dot'" :style="p.m ? '' : 'background: var(--ink-muted)'"></span>{{ p.m?.name || t('common') }}</span><b>{{ money0(p.v) }} MDL</b></div>
    </div>

    <Projects />

    <Subscriptions />

    <NetWorth />
  </main>
</template>
