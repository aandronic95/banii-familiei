<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, accountById, balances, categoryById } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money, dateLong } from '../lib/format.js'
import TxRow from '../components/TxRow.vue'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const accountId = route.query.account || ''
const categoryId = route.query.category || ''
const acc = accountId ? accountById(accountId) : null
const cat = categoryId ? categoryById(categoryId) : null
const who = ref('')
const q = ref('')
const limit = ref(60)

const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  return S.transactions
    .filter((x) => !accountId || x.account_id === accountId || x.to_account_id === accountId)
    .filter((x) => !categoryId || x.category_id === categoryId)
    .filter((x) => !who.value || x.member_id === who.value)
    .filter((x) => !s || [x.merchant, x.note, catName(categoryById(x.category_id))].some((v) => (v || '').toLowerCase().includes(s)))
    .sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at))
})
const groups = computed(() => {
  const out = []
  for (const x of list.value.slice(0, limit.value)) {
    const last = out[out.length - 1]
    if (last && last.date === x.date) last.items.push(x)
    else out.push({ date: x.date, items: [x] })
  }
  return out
})
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ acc ? acc.name : cat ? catName(cat) : t('transactions') }}</h1>
      <button v-if="acc" type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/account/' + acc.id)">{{ t('edit') }}</button>
    </div>

    <div v-if="acc" class="bf-card">
      <div class="bf-balance__label">{{ acc.bank || t(acc.type === 'card' ? 'cards' : acc.type === 'cash' ? 'cash' : 'deposits') }}</div>
      <div class="bf-balance__amount">{{ money(balances[acc.id]) }}<span class="bf-balance__cur">{{ acc.currency }}</span></div>
      <div style="margin-top: 12px;"><button type="button" class="bf-btn bf-btn--secondary" @click="router.push({ path: '/tx/new', query: { account: acc.id } })"><Icon name="plus" />{{ t('add') }}</button></div>
    </div>

    <input v-model="q" class="inp" type="search" :placeholder="t('search')" :aria-label="t('search')">
    <div class="bf-chips">
      <button type="button" class="bf-chip" :class="{ 'bf-chip--on': !who }" @click="who = ''">{{ t('all') }}</button>
      <button v-for="m in S.members" :key="m.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': who === m.id }" @click="who = m.id"><span :class="`bf-dot bf-p${m.color}`"></span>{{ m.name }}</button>
    </div>

    <section v-for="g in groups" :key="g.date">
      <div class="bf-list__head">{{ dateLong(g.date) }}</div>
      <div class="bf-list"><TxRow v-for="x in g.items" :key="x.id" :tx="x" /></div>
    </section>
    <div v-if="!list.length" class="bf-card empty">{{ t('noTx') }}</div>
    <button v-if="list.length > limit" type="button" class="bf-btn bf-btn--secondary" @click="limit += 100">…</button>
  </main>
</template>
