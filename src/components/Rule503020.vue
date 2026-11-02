<script setup>
// Regula 50/30/20: din venit, ~50% necesare, ~30% dorințe, ~20% economii
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, monthRange, toMdl, txCurrency, categoryById } from '../store.js'
import { rule503020 } from '../lib/home.js'
import { t, catName } from '../lib/i18n.js'
import { money0, todayISO, monthName } from '../lib/format.js'

const router = useRouter()
const today = todayISO()
const offset = ref(0) // 0 = luna curentă, 1 = luna trecută
const range = computed(() => {
  const [y, m] = today.split('-').map(Number)
  return monthRange(new Date(Date.UTC(y, m - 1 - offset.value, 1)).toISOString().slice(0, 10))
})
const r = computed(() => {
  const [a, b] = range.value
  let income = 0
  const rows = []
  for (const x of S.transactions) {
    if (x.date < a || x.date > b) continue
    const v = toMdl(x.amount, txCurrency(x))
    if (x.kind === 'income') income += v
    else if (x.kind === 'expense') rows.push({ amount: v, category: categoryById(x.category_id) })
  }
  return rule503020(rows, income)
})
const label = computed(() => monthName(Number(range.value[0].slice(5, 7)) - 1).toLowerCase())
const parts = computed(() => [
  { k: 'needs', v: r.value.needs, p: r.value.pNeeds, target: 50, color: 'var(--person-3)' },
  { k: 'wants', v: r.value.wants, p: r.value.pWants, target: 30, color: 'var(--person-2)' },
  { k: 'savings', v: r.value.savings, p: r.value.pSavings, target: 20, color: 'var(--income)' },
])
const tips = computed(() => {
  const out = []
  const x = r.value
  if (!x.income) return out
  if (x.overWants > 0 && x.topWants.length) out.push(t('r53Cut', money0(x.overWants), x.topWants.map((w) => (w.category ? catName(w.category) : t('noCategory')) + ' ' + money0(w.amount)).join(', ')))
  if (x.overNeeds > 0) out.push(t('r53Needs', money0(x.overNeeds)))
  if (x.pSavings !== null && x.pSavings >= 20) out.push(t('r53Good', x.pSavings))
  else if (x.pSavings !== null && x.pSavings >= 0) out.push(t('r53Save', money0(Math.max(0, x.income * 0.2 - x.savings))))
  else out.push(t('r53Neg', money0(-x.savings)))
  return out
})
</script>

<template>
  <section class="bf-card stack" aria-labelledby="r53-h">
    <div class="sec-head">
      <h2 id="r53-h" class="h-sec">{{ t('r53Title') }}</h2>
      <div class="bf-chips" style="flex-wrap: nowrap;">
        <button type="button" class="bf-chip" style="min-height: 30px; padding: 0 10px; font-size: 13px;" :class="{ 'bf-chip--on': offset === 1 }" @click="offset = 1">{{ t('prevMonth') }}</button>
        <button type="button" class="bf-chip" style="min-height: 30px; padding: 0 10px; font-size: 13px;" :class="{ 'bf-chip--on': offset === 0 }" @click="offset = 0">{{ t('curMonth') }}</button>
      </div>
    </div>
    <p v-if="!r.income" class="hint" style="margin: 0;">{{ t('r53NoIncome', label) }}</p>
    <template v-else>
      <div class="cap">{{ t('r53Income', label, money0(r.income)) }}</div>
      <div style="display: flex; height: 14px; border-radius: 999px; overflow: hidden; gap: 2px;" role="img" :aria-label="parts.map((p) => `${t('r53_' + p.k)} ${p.p}%`).join(', ')">
        <div v-for="p in parts.filter((x) => x.v > 0)" :key="p.k" :style="{ flex: Math.max(0, p.v), background: p.color }"></div>
      </div>
      <div v-for="p in parts" :key="p.k" class="kv">
        <span><span class="bf-dot" :style="{ background: p.color }"></span>{{ t('r53_' + p.k) }} <span class="cap">· {{ t('r53Target', p.target) }}</span></span>
        <span style="text-align: right;"><b :class="p.k !== 'savings' ? (p.p > p.target + 5 ? 'bf-expense' : '') : (p.p >= p.target ? 'bf-income' : 'bf-expense')">{{ p.p }}%</b> <span class="cap">{{ money0(p.v) }}</span></span>
      </div>
      <ul class="hint" style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;">
        <li v-for="(x, i) in tips" :key="i">{{ x }}</li>
      </ul>
      <button type="button" class="link" style="align-self: flex-start; padding: 0;" @click="router.push('/budgets')">{{ t('r53Setup') }}</button>
    </template>
  </section>
</template>
