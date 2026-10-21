<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, budgetRows } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money0 } from '../lib/format.js'
import BudgetBar from '../components/BudgetBar.vue'
import Icon from '../components/Icon.vue'

const router = useRouter()
const groups = computed(() => ['expense', 'income'].map((k) => ({ k, items: S.categories.filter((c) => c.kind === k && !c.archived).sort((a, b) => a.sort - b.sort) })))
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('budgets') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/category/new')"><Icon name="plus" />{{ t('category') }}</button>
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
