<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, debtsSummary, memberById } from '../store.js'
import { t } from '../lib/i18n.js'
import { money, money0, dateLong, daysUntil } from '../lib/format.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const showSettled = ref(false)
const groups = computed(() => ['owed_to_us', 'we_owe'].map((dir) => ({
  dir,
  items: S.debts.filter((d) => d.direction === dir && (showSettled.value || !d.settled))
    .sort((a, b) => Number(a.settled) - Number(b.settled) || (a.due_date || '9999').localeCompare(b.due_date || '9999')),
})).filter((g) => g.items.length))
const hasSettled = computed(() => S.debts.some((d) => d.settled))
const left = (d) => Number(d.amount) - Number(d.paid)
function sub(d) {
  const bits = [dateLong(d.date)]
  if (d.due_date && !d.settled) {
    const n = daysUntil(d.due_date)
    bits.push(t('debtDue') + ': ' + (n < 0 ? dateLong(d.due_date) : t('inDays', n)))
  }
  if (Number(d.paid) > 0 && !d.settled) bits.push(t('debtLeft', money0(left(d))))
  const m = memberById(d.member_id)
  if (m) bits.push(m.name)
  return bits.join(' · ')
}
const late = (d) => !d.settled && d.due_date && daysUntil(d.due_date) < 0
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('debtsTitle') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/debt/new')"><Icon name="plus" />{{ t('add') }}</button>
    </div>

    <div v-if="S.debts.length" class="grid2">
      <div class="stat"><span>{{ t('totalOwedToUs') }}</span><b class="bf-income">{{ money0(debtsSummary.owed) }}</b><span>MDL</span></div>
      <div class="stat"><span>{{ t('totalWeOwe') }}</span><b class="bf-expense">{{ money0(debtsSummary.owe) }}</b><span>MDL</span></div>
    </div>
    <div v-else class="bf-card empty stack">
      <span>{{ t('noDebts') }}</span>
      <button type="button" class="bf-btn bf-btn--primary" @click="router.push('/debt/new')">{{ t('newDebt') }}</button>
    </div>

    <section v-for="g in groups" :key="g.dir">
      <div class="bf-list__head">{{ t(g.dir === 'owed_to_us' ? 'owedToUs' : 'weOwe') }}</div>
      <div class="bf-list">
        <button v-for="d in g.items" :key="d.id" type="button" class="bf-row bf-row--tap" :style="{ opacity: d.settled ? 0.55 : 1 }" @click="router.push('/debt/' + d.id)">
          <span class="av" style="box-shadow: inset 0 0 0 2px var(--line);">{{ d.person.slice(0, 1).toUpperCase() }}</span>
          <div class="bf-row__body">
            <div class="bf-row__title">{{ d.person }}</div>
            <div class="bf-row__sub" :style="late(d) ? 'color: var(--danger);' : ''">{{ d.settled ? t('settled') : sub(d) }}</div>
          </div>
          <div class="bf-row__amount" :class="d.settled ? '' : g.dir === 'owed_to_us' ? 'bf-income' : 'bf-expense'">{{ money(d.settled ? d.amount : left(d)) }}<small>{{ d.currency }}</small></div>
        </button>
      </div>
    </section>
    <button v-if="hasSettled" type="button" class="link" @click="showSettled = !showSettled">{{ showSettled ? t('gHide') : t('settled') }}</button>
  </main>
</template>
