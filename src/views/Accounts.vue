<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, balances, activeAccounts, totalMdl, totalsByCurrency, memberById, debtMdl } from '../store.js'
import { t } from '../lib/i18n.js'
import { money, money0 } from '../lib/format.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const groups = computed(() => [
  { key: 'card', title: t('cards'), icon: 'card' },
  { key: 'cash', title: t('cash'), icon: 'cash' },
  { key: 'deposit', title: t('deposits'), icon: 'piggy' },
].map((g) => ({ ...g, items: activeAccounts.value.filter((a) => a.type === g.key) })).filter((g) => g.items.length))
const sub = (a) => {
  const m = memberById(a.member_id)
  const bits = []
  if (a.bank) bits.push(a.bank)
  if (a.last4) bits.push('•• ' + a.last4)
  if (a.interest_rate) bits.push(String(a.interest_rate).replace('.', ',') + '%')
  bits.push(m ? m.name : t('common'))
  return { text: bits.join(' · '), dot: m ? `bf-dot bf-p${m.color}` : null }
}
const openLoans = computed(() => S.loans.filter((l) => !l.closed).length)
const fmtRate = (r) => String(r).replace('.', ',')
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('accounts') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/account/new')"><Icon name="plus" />{{ t('addAccount') }}</button>
    </div>

    <div class="bf-card">
      <div class="bf-balance__label">{{ t('totalMdl') }}</div>
      <div class="bf-balance__amount">{{ money(totalMdl) }}<span class="bf-balance__cur">MDL</span></div>
      <div class="bf-chips" style="margin-top: 12px;">
        <span v-for="(v, c) in totalsByCurrency" :key="c" class="bf-chip">{{ money0(v) }} {{ c }}</span>
      </div>
      <div v-if="S.rates.EUR" class="bf-budget__note" style="margin-top: 8px;">{{ t('rateNote', 'EUR', fmtRate(S.rates.EUR)) }} · 1 USD = {{ fmtRate(S.rates.USD || '—') }} MDL</div>
    </div>

    <section v-for="g in groups" :key="g.key">
      <div class="bf-list__head">{{ g.title }}</div>
      <div class="bf-list">
        <button v-for="a in g.items" :key="a.id" type="button" class="bf-row bf-row--tap" @click="router.push({ path: '/transactions', query: { account: a.id } })">
          <div class="bf-row__icon"><Icon :name="g.icon" /></div>
          <div class="bf-row__body">
            <div class="bf-row__title">{{ a.name }}</div>
            <div class="bf-row__sub"><span v-if="sub(a).dot" :class="sub(a).dot"></span>{{ sub(a).text }}</div>
          </div>
          <div class="bf-row__amount">{{ money(balances[a.id]) }}<small>{{ a.currency }}</small></div>
        </button>
      </div>
    </section>

    <button type="button" class="bf-row bf-list bf-row--tap" @click="router.push('/credits')">
      <div class="bf-row__icon" style="background: var(--danger-soft); color: var(--danger);"><Icon name="bank" /></div>
      <div class="bf-row__body"><div class="bf-row__title">{{ t('credits') }}</div><div class="bf-row__sub">{{ t('activeLoans', openLoans) }}</div></div>
      <div class="bf-row__amount" :class="{ 'bf-expense': debtMdl > 0 }">{{ money0(debtMdl) }}<small>{{ t('toPay') }}</small></div>
    </button>

    <p class="hint">{{ t('assetsHint') }}</p>
  </main>
</template>
