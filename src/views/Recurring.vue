<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, accountById, categoryById, toMdl } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money, money0, dateShort } from '../lib/format.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const list = computed(() => [...S.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.next_date.localeCompare(b.next_date)))
const monthly = computed(() => {
  let exp = 0, inc = 0
  for (const r of S.recurring) {
    if (!r.active) continue
    const v = toMdl(r.amount, accountById(r.account_id)?.currency || 'MDL') / r.every_months
    if (r.kind === 'income') inc += v; else exp += v
  }
  return { exp, inc }
})
const icon = (r) => categoryById(r.category_id)?.icon || (r.kind === 'income' ? 'wallet' : 'clock')
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('recurringTitle') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/recurring/new')"><Icon name="plus" />{{ t('add') }}</button>
    </div>

    <div v-if="S.recurring.length" class="bf-card">
      <div class="bf-balance__label">{{ t('perMonthTotal') }}</div>
      <div class="bf-balance__amount" style="font-size: 28px;"><span class="bf-expense">−{{ money0(monthly.exp) }}</span><span class="bf-balance__cur">MDL</span></div>
      <div v-if="monthly.inc" class="bf-balance__meta"><span>{{ t('incomes') }}: <b class="bf-income">+{{ money0(monthly.inc) }}</b></span></div>
    </div>

    <div v-else class="bf-card empty stack">
      <span>{{ t('noRecurring') }}</span>
      <button type="button" class="bf-btn bf-btn--primary" @click="router.push('/recurring/new')">{{ t('newRecurring') }}</button>
    </div>

    <div v-if="list.length" class="bf-list">
      <button v-for="r in list" :key="r.id" type="button" class="bf-row bf-row--tap" :style="{ opacity: r.active ? 1 : 0.55 }" @click="router.push('/recurring/' + r.id)">
        <div class="bf-row__icon"><Icon :name="icon(r)" /></div>
        <div class="bf-row__body">
          <div class="bf-row__title">{{ r.name }}</div>
          <div class="bf-row__sub">{{ t('recEveryLabel', r.every_months) }} · {{ r.active ? t('recNext', dateShort(r.next_date)) : t('paused') }}{{ r.category_id ? ' · ' + catName(categoryById(r.category_id)) : '' }}</div>
        </div>
        <div class="bf-row__amount" :class="r.kind === 'income' ? 'bf-income' : 'bf-expense'">
          {{ r.kind === 'income' ? '+' : '−' }}{{ money(r.amount) }}
          <small>{{ accountById(r.account_id)?.name || '' }}</small>
        </div>
      </button>
    </div>
  </main>
</template>
