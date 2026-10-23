<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { S, investStatuses, investedMdl, toMdl, memberById, growthAt, liveInvestValue, liveInfo } from '../store.js'
import { t } from '../lib/i18n.js'
import { money, money0, dateLong, daysUntil } from '../lib/format.js'
import Icon from '../components/Icon.vue'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import { nowMs } from '../lib/live.js'

const router = useRouter()
const showClosed = ref(false)
const growth = computed(() => growthAt(nowMs.value))
const live = (i) => liveInvestValue(i, nowMs.value)
const ticks = (i) => !!liveInfo(i)
const KIND_ICON = { gov_bond: 'bank', tbill: 'bank', p2p: 'users', stocks: 'chart', other: 'piggy' }

const list = computed(() => S.investments.filter((i) => showClosed.value || i.status !== 'closed'))
const groups = computed(() => {
  const by = {}
  for (const i of list.value) (by[i.platform || '—'] ??= []).push(i)
  return Object.entries(by)
    .map(([platform, items]) => ({
      platform,
      items: items.sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || (a.maturity_date || '9999').localeCompare(b.maturity_date || '9999')),
      value: items.reduce((s, i) => s + toMdl(investStatuses.value[i.id].value, i.currency), 0),
    }))
    .sort((a, b) => b.value - a.value)
})
const totals = computed(() => {
  let profit = 0, received = 0
  for (const i of S.investments) {
    const st = investStatuses.value[i.id]
    if (i.status !== 'closed') profit += toMdl(live(i) - Number(i.amount), i.currency)
    received += toMdl(st.received, i.currency)
  }
  return { profit, received }
})
const byKind = computed(() => {
  const o = {}
  for (const i of S.investments) if (i.status !== 'closed') o[i.kind] = (o[i.kind] || 0) + toMdl(investStatuses.value[i.id].value, i.currency)
  return Object.entries(o).sort((a, b) => b[1] - a[1])
})
const hasClosed = computed(() => S.investments.some((i) => i.status === 'closed'))

function sub(i) {
  const bits = []
  if (i.code) bits.push(i.code)
  if (i.rate) bits.push(String(Number(i.rate)).replace('.', ',') + '%')
  if (i.maturity_date) bits.push(t('matures', dateLong(i.maturity_date)))
  const m = memberById(i.member_id)
  if (m) bits.push(m.name)
  return bits.join(' · ')
}
function badge(i) {
  if (i.status === 'late') return { text: t('stLate'), style: 'background: var(--warning-soft); color: var(--warning);' }
  if (i.status === 'closed') return { text: t('stClosed'), style: '' }
  if (i.maturity_date && daysUntil(i.maturity_date) <= 7) return { text: daysUntil(i.maturity_date) < 0 ? dateLong(i.maturity_date) : t('inDays', daysUntil(i.maturity_date)), style: 'background: var(--warning-soft); color: var(--warning);' }
  return null
}
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('investments') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/investment/new')"><Icon name="plus" />{{ t('add') }}</button>
    </div>

    <div class="bf-card">
      <div class="bf-balance__label">{{ t('invValue') }}</div>
      <div class="bf-balance__amount"><AnimatedNumber :value="growth.invest" :flash="false" /><span class="bf-balance__cur">MDL</span></div>
      <div class="bf-balance__meta" style="flex-wrap: wrap;">
        <span>{{ t('invInvested') }}: <b>{{ money0(investedMdl) }}</b></span>
        <span>{{ t('invProfit') }}: <b :class="totals.profit >= 0 ? 'bf-income' : 'bf-expense'"><AnimatedNumber :value="totals.profit" :decimals="2" sign :flash="false" :duration="950" /></b></span>
        <span v-if="totals.received">{{ t('invReceived') }}: <b class="bf-income">+{{ money0(totals.received) }}</b></span>
      </div>
      <div v-if="growth.perDay > 0" class="live">
        <span class="live-dot" aria-hidden="true"></span>
        <span>{{ t('liveNow') }}</span>
        <b><AnimatedNumber :value="growth.accrued" :decimals="6" sign :duration="950" :flash="false" /> MDL</b>
        <span style="margin-left: auto;">{{ t('livePerDay', money(growth.perDay)) }}</span>
      </div>
      <div v-if="byKind.length > 1" class="bf-chips" style="margin-top: 12px;">
        <span v-for="[k, v] in byKind" :key="k" class="bf-chip">{{ t('invKind_' + k) }} · {{ money0(v) }}</span>
      </div>
    </div>

    <div v-if="!S.investments.length" class="bf-card empty stack">
      <span>{{ t('noInvestments') }}</span>
      <button type="button" class="bf-btn bf-btn--primary" @click="router.push('/investment/new')">{{ t('newInvestment') }}</button>
    </div>

    <section v-for="g in groups" :key="g.platform">
      <div class="bf-list__head" style="display: flex; justify-content: space-between; gap: 8px;">
        <span style="text-transform: none; letter-spacing: 0; font-size: 14px;">{{ g.platform }}</span>
        <span style="text-transform: none; letter-spacing: 0; font-variant-numeric: tabular-nums;">{{ money0(g.value) }} MDL</span>
      </div>
      <div class="bf-list">
        <button v-for="i in g.items" :key="i.id" type="button" class="bf-row bf-row--tap" :style="{ opacity: i.status === 'closed' ? 0.6 : 1 }" @click="router.push('/investment/' + i.id)">
          <div class="bf-row__icon"><Icon :name="KIND_ICON[i.kind]" /></div>
          <div class="bf-row__body">
            <div class="bf-row__title">{{ i.name }}</div>
            <div class="bf-row__sub">{{ sub(i) }}</div>
            <span v-if="badge(i)" class="role" :style="badge(i).style + 'display: inline-block; margin-top: 4px;'">{{ badge(i).text }}</span>
          </div>
          <div class="bf-row__amount">
            <template v-if="investStatuses[i.id].closed">{{ money(i.amount) }}</template><AnimatedNumber v-else :value="live(i)" :flash="false" /> {{ i.currency !== 'MDL' ? i.currency : '' }}
            <small v-if="!investStatuses[i.id].closed && Math.abs(live(i) - i.amount) >= 0.0001" :class="live(i) > i.amount ? 'bf-income' : 'bf-expense'">
              <AnimatedNumber :value="live(i) - i.amount" :decimals="ticks(i) ? 6 : 2" sign :flash="false" :duration="950" />
            </small>
            <small v-else-if="i.currency === 'MDL'">MDL</small>
          </div>
        </button>
      </div>
    </section>

    <button v-if="hasClosed" type="button" class="link" @click="showClosed = !showClosed">{{ showClosed ? t('gHide') : t('stClosed') }}</button>
  </main>
</template>
