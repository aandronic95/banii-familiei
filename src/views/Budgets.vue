<script setup>
import { computed, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { S, budgetRows, budgetSuggestions, save } from '../store.js'
import { toast } from '../components/Toast.js'
import { haptic } from '../lib/telegram.js'
import { t, catName } from '../lib/i18n.js'
import { money0 } from '../lib/format.js'
import BudgetBar from '../components/BudgetBar.vue'
import Icon from '../components/Icon.vue'

const router = useRouter()
// Bugete sugerate din media ultimelor 3 luni
const sug = ref(null)
const pick = reactive({})
function openSug() {
  sug.value = budgetSuggestions()
  for (const r of sug.value.rows) pick[r.cat.id] = !r.loan && Math.abs(r.suggested - r.current) >= 50
}
const chosen = computed(() => (sug.value?.rows || []).filter((r) => pick[r.cat.id]))
const busy = ref(false)
async function applySug() {
  busy.value = true
  try {
    for (const r of chosen.value) await save('categories', { id: r.cat.id, budget: r.suggested })
    haptic('success'); toast(t('sugApplied', chosen.value.length)); sug.value = null
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = false }
}
const groups = computed(() => ['expense', 'income'].map((k) => ({ k, items: S.categories.filter((c) => c.kind === k && !c.archived).sort((a, b) => a.sort - b.sort) })))
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('budgets') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/category/new')"><Icon name="plus" />{{ t('category') }}</button>
    </div>
    <div v-if="!sug" class="bf-banner" style="cursor: pointer; background: var(--brand-soft); color: var(--ink);" role="button" tabindex="0" @click="openSug" @keydown.enter="openSug">
      <Icon name="chart" />
      <div style="flex: 1;"><b>{{ t('sugTitle') }}</b><div class="cap">{{ t('sugSub') }}</div></div>
      <span class="chev" aria-hidden="true">›</span>
    </div>
    <div v-else class="bf-card stack">
      <div class="sec-head"><h2 class="h-sec">{{ t('sugTitle') }}</h2><button type="button" class="link" @click="sug = null">{{ t('cancel') }}</button></div>
      <p v-if="!sug.rows.length" class="hint" style="margin: 0;">{{ t('sugEmpty') }}</p>
      <template v-else>
        <p class="hint" style="margin: 0;">{{ t('sugBasis', sug.months) }}</p>
        <label v-for="r in sug.rows" :key="r.cat.id" class="kv" style="cursor: pointer; gap: 10px;">
          <input v-model="pick[r.cat.id]" type="checkbox" style="width: 20px; height: 20px; accent-color: var(--brand); flex: none;">
          <span style="flex: 1; min-width: 0;">
            <span style="font-weight: 600;">{{ catName(r.cat) }}</span>
            <span class="cap" style="display: block;">{{ t('sugAvg', money0(r.avg)) }}{{ r.loan ? ' · ' + t('sugLoan') : '' }}</span>
          </span>
          <span style="text-align: right; white-space: nowrap;">
            <span v-if="r.current" class="cap" style="text-decoration: line-through;">{{ money0(r.current) }}</span>
            <b style="display: block;">{{ money0(r.suggested) }} MDL</b>
          </span>
        </label>
        <button type="button" class="bf-btn bf-btn--primary" :disabled="!chosen.length || busy" @click="applySug">{{ t('sugApply', chosen.length) }}</button>
      </template>
    </div>

    <div v-if="budgetRows.length" class="bf-card stack-lg">
      <BudgetBar v-for="r in budgetRows" :key="r.cat.id" :row="r" />
    </div>
    <section v-for="g in groups" :key="g.k">
      <div class="bf-list__head">{{ t(g.k === 'expense' ? 'expenses' : 'incomes') }}</div>
      <div class="bf-list">
        <button v-for="c in g.items" :key="c.id" type="button" class="bf-row bf-row--tap" @click="router.push('/category/' + c.id)">
          <div class="bf-row__icon"><Icon :name="c.icon" /></div>
          <div class="bf-row__body"><div class="bf-row__title">{{ catName(c) }}</div></div>
          <div v-if="g.k === 'expense'" class="bf-row__amount" :class="{ muted: !c.budget }" style="font-weight: 500;">{{ c.budget ? money0(c.budget) + ' MDL' : t('noBudget') }}</div>
          <span class="chev" aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  </main>
</template>
