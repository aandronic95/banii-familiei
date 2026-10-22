<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { accountById, categoryById, memberById } from '../store.js'
import { catName, t } from '../lib/i18n.js'
import { money, dateShort } from '../lib/format.js'

const props = defineProps({ tx: { type: Object, required: true } })
const router = useRouter()

const info = computed(() => {
  const x = props.tx
  const acc = accountById(x.account_id)
  const cat = categoryById(x.category_id)
  const mem = memberById(x.member_id)
  let title = x.merchant || catName(cat) || t(x.kind)
  let icon = cat?.icon || (x.kind === 'income' ? 'wallet' : 'tag')
  const sub = []
  if (x.kind === 'transfer') {
    title = t('transfer')
    icon = 'swap'
    sub.push(`${acc?.name || ''} → ${accountById(x.to_account_id)?.name || ''}`)
  } else {
    if (mem) sub.push(mem.name)
    if (acc) sub.push(acc.name)
  }
  if (x.kind === 'invest' || x.kind === 'divest') {
    title = x.merchant || t(x.kind === 'invest' ? 'invested' : 'returned')
    icon = 'chart'
    sub.length = 0
    sub.push(t(x.kind === 'invest' ? 'invested' : 'returned'))
    if (acc) sub.push(acc.name)
  }
  if (x.car_kind === 'fuel') { icon = 'fuel'; if (x.fuel_liters) sub.push(`${String(x.fuel_liters).replace('.', ',')} L`) }
  if (x.receipt_path) sub.push(t('bon'))
  const sign = x.kind === 'income' || x.kind === 'divest' ? '+' : x.kind === 'expense' || x.kind === 'invest' ? '−' : ''
  return {
    title, icon, sub: sub.join(' · '), dot: mem ? `bf-dot bf-p${mem.color}` : null,
    amount: sign + money(x.amount) + (acc && acc.currency !== 'MDL' ? ' ' + acc.currency : ''),
    cls: x.kind === 'income' ? 'bf-income' : x.kind === 'expense' ? 'bf-expense' : '',
  }
})
</script>

<template>
  <button type="button" class="bf-row bf-row--tap" @click="router.push('/tx/' + tx.id)">
    <div class="bf-row__icon"><Icon :name="info.icon" /></div>
    <div class="bf-row__body">
      <div class="bf-row__title">{{ info.title }}</div>
      <div class="bf-row__sub"><span v-if="info.dot" :class="info.dot"></span>{{ info.sub }}</div>
    </div>
    <div class="bf-row__amount" :class="info.cls">{{ info.amount }}<small>{{ dateShort(tx.date) }}</small></div>
  </button>
</template>
