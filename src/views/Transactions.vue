<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, accountById, balances, categoryById, toMdl, txCurrency, tagStats, activeAccounts } from '../store.js'
import { supabase } from '../lib/supabase.js'
import { toast } from '../components/Toast.js'
import { reactive } from 'vue'
import { t, catName } from '../lib/i18n.js'
import { money, money0, dateLong, parseAmount, dateShort } from '../lib/format.js'
import TxRow from '../components/TxRow.vue'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const accountId = route.query.account || ''
const categoryId = route.query.category || ''
const tag = route.query.tag || ''
const uncat = route.query.uncat === '1'
const acc = accountId ? accountById(accountId) : null
const cat = categoryId ? categoryById(categoryId) : null
const who = ref('')
const q = ref('')
const limit = ref(60)

// Filtre avansate: tip, sumă, perioadă, cont, categorie, etichetă
const showF = ref(false)
const F = reactive({ kind: '', min: '', max: '', from: '', to: '', account: '', category: '', tag: '' })
const nF = computed(() => Object.values(F).filter(Boolean).length)
function resetF() { Object.assign(F, { kind: '', min: '', max: '', from: '', to: '', account: '', category: '', tag: '' }) }
function preset(p) {
  const d = new Date(), iso = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  if (p === 'month') { F.from = iso(new Date(d.getFullYear(), d.getMonth(), 1)); F.to = '' }
  if (p === 'prev') { F.from = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)); F.to = iso(new Date(d.getFullYear(), d.getMonth(), 0)) }
  if (p === 'year') { F.from = `${d.getFullYear()}-01-01`; F.to = '' }
}
const allCats = computed(() => S.categories.filter((c) => !c.archived))

const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  return S.transactions
    .filter((x) => !accountId || x.account_id === accountId || x.to_account_id === accountId)
    .filter((x) => !categoryId || x.category_id === categoryId)
    .filter((x) => !tag || (x.tags || []).includes(tag))
    .filter((x) => !uncat || (x.kind === 'expense' && !x.category_id))
    .filter((x) => !who.value || x.member_id === who.value)
    .filter((x) => !F.kind || x.kind === F.kind)
    .filter((x) => !F.account || x.account_id === F.account || x.to_account_id === F.account)
    .filter((x) => !F.category || x.category_id === F.category)
    .filter((x) => !F.tag || (x.tags || []).includes(F.tag))
    .filter((x) => !F.from || x.date >= F.from)
    .filter((x) => !F.to || x.date <= F.to)
    .filter((x) => { const v = toMdl(x.amount, txCurrency(x)); return (!F.min || v >= parseAmount(F.min)) && (!F.max || v <= parseAmount(F.max)) })
    .filter((x) => !s || [x.merchant, x.note, catName(categoryById(x.category_id)), ...(x.tags || []).map((g) => '#' + g)].some((v) => (v || '').toLowerCase().includes(s)))
    .sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at))
})
const summary = computed(() => {
  let exp = 0, inc = 0
  for (const x of list.value) { if (x.kind === 'expense') exp += toMdl(x.amount, txCurrency(x)); if (x.kind === 'income') inc += toMdl(x.amount, txCurrency(x)) }
  return { exp, inc, n: list.value.length }
})
const filtering = computed(() => nF.value > 0 || !!q.value.trim() || !!who.value || !!tag || uncat || !!categoryId || !!accountId)
const sending = ref(false)
async function exportList() {
  sending.value = true
  try {
    const label = [q.value && `„${q.value}”`, F.from && `${t('from')} ${dateShort(F.from, true)}`, F.to && `${t('to')} ${dateShort(F.to, true)}`].filter(Boolean).join(' · ')
    const { data, error } = await supabase.functions.invoke('docs?type=filtered', { body: { ids: list.value.map((x) => x.id), label } })
    if (error || !data?.ok) throw error || new Error('send')
    toast(t('exportSent'))
  } catch (e) { console.error(e); toast(t('error', e)) } finally { sending.value = false }
}
const groups = computed(() => {
  const out = []
  for (const x of list.value.slice(0, limit.value)) {
    const last = out[out.length - 1]
    const g = last && last.date === x.date ? last : (out.push({ date: x.date, items: [], exp: 0, inc: 0 }), out[out.length - 1])
    g.items.push(x)
    if (x.kind === 'expense') g.exp += toMdl(x.amount, txCurrency(x))
    if (x.kind === 'income') g.inc += toMdl(x.amount, txCurrency(x))
  }
  return out
})
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ acc ? acc.name : cat ? catName(cat) : tag ? '#' + tag : uncat ? t('noCategory') : t('transactions') }}</h1>
      <button v-if="acc" type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/account/' + acc.id)">{{ t('edit') }}</button>
    </div>

    <div v-if="acc" class="bf-card">
      <div class="bf-balance__label">{{ acc.bank || t(acc.type === 'card' ? 'cards' : acc.type === 'cash' ? 'cash' : 'deposits') }}</div>
      <div class="bf-balance__amount">{{ money(balances[acc.id]) }}<span class="bf-balance__cur">{{ acc.currency }}</span></div>
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button type="button" class="bf-btn bf-btn--secondary" @click="router.push({ path: '/tx/new', query: { account: acc.id } })"><Icon name="plus" />{{ t('add') }}</button>
        <button type="button" class="bf-btn bf-btn--secondary" @click="router.push('/import')"><Icon name="list" />{{ t('importTitle') }}</button>
      </div>
    </div>

    <div style="display: flex; gap: 8px;">
      <input v-model="q" class="inp" type="search" :placeholder="t('search')" :aria-label="t('search')" style="flex: 1;">
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 48px; position: relative;" :aria-expanded="showF" @click="showF = !showF">
        <Icon name="filter" />{{ t('filters') }}<span v-if="nF" class="fbadge">{{ nF }}</span>
      </button>
    </div>
    <div v-if="showF" class="bf-card stack">
      <div class="seg" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
        <button v-for="k in ['', 'expense', 'income', 'transfer']" :key="k" type="button" :class="{ on: F.kind === k }" @click="F.kind = k">{{ k ? t(k) : t('all') }}</button>
      </div>
      <div class="grid2">
        <div class="fld"><label for="f-min">{{ t('fMin') }}, MDL</label><input id="f-min" v-model="F.min" class="inp" inputmode="decimal" placeholder="0"></div>
        <div class="fld"><label for="f-max">{{ t('fMax') }}, MDL</label><input id="f-max" v-model="F.max" class="inp" inputmode="decimal" placeholder="∞"></div>
        <div class="fld"><label for="f-from">{{ t('from') }}</label><input id="f-from" v-model="F.from" type="date" class="inp"></div>
        <div class="fld"><label for="f-to">{{ t('to') }}</label><input id="f-to" v-model="F.to" type="date" class="inp"></div>
      </div>
      <div class="bf-chips">
        <button type="button" class="bf-chip" @click="preset('month')">{{ t('thisMonth') }}</button>
        <button type="button" class="bf-chip" @click="preset('prev')">{{ t('prevMonth') }}</button>
        <button type="button" class="bf-chip" @click="preset('year')">{{ t('year') }}</button>
      </div>
      <div class="fld" v-if="!accountId"><label for="f-acc">{{ t('account') }}</label>
        <select id="f-acc" v-model="F.account" class="inp"><option value="">{{ t('all') }}</option><option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ a.name }}</option></select></div>
      <div class="fld" v-if="!categoryId"><label for="f-cat">{{ t('category') }}</label>
        <select id="f-cat" v-model="F.category" class="inp"><option value="">{{ t('all') }}</option><option v-for="c in allCats" :key="c.id" :value="c.id">{{ catName(c) }}</option></select></div>
      <div class="fld" v-if="tagStats.length && !tag"><label for="f-tag">{{ t('tags') }}</label>
        <select id="f-tag" v-model="F.tag" class="inp"><option value="">{{ t('all') }}</option><option v-for="g in tagStats" :key="g.tag" :value="g.tag">#{{ g.tag }}</option></select></div>
      <button v-if="nF" type="button" class="link" style="align-self: flex-start; padding: 0;" @click="resetF">{{ t('fReset') }}</button>
    </div>
    <div v-if="filtering && list.length" class="bf-card" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px;">
      <div style="flex: 1; min-width: 0;" class="cap">
        <b style="color: var(--ink);">{{ t('fFound', summary.n) }}</b><br>
        <span v-if="summary.exp" class="bf-expense">−{{ money0(summary.exp) }}</span><span v-if="summary.exp && summary.inc"> · </span><span v-if="summary.inc" class="bf-income">+{{ money0(summary.inc) }}</span> MDL
      </div>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" :disabled="sending" @click="exportList"><Icon name="upload" :size="16" />{{ t('fExport') }}</button>
    </div>
    <div class="bf-chips">
      <button type="button" class="bf-chip" :class="{ 'bf-chip--on': !who }" @click="who = ''">{{ t('all') }}</button>
      <button v-for="m in S.members" :key="m.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': who === m.id }" @click="who = m.id"><span :class="`bf-dot bf-p${m.color}`"></span>{{ m.name }}</button>
    </div>

    <section v-for="g in groups" :key="g.date">
      <div class="bf-list__head" style="display: flex; justify-content: space-between; gap: 8px;">
        <span>{{ dateLong(g.date) }}</span>
        <span style="text-transform: none; letter-spacing: 0; font-variant-numeric: tabular-nums;">
          <span v-if="g.inc" class="bf-income">+{{ money0(g.inc) }}</span><span v-if="g.inc && g.exp"> · </span><span v-if="g.exp">−{{ money0(g.exp) }}</span>
        </span>
      </div>
      <div class="bf-list"><TxRow v-for="x in g.items" :key="x.id" :tx="x" /></div>
    </section>
    <div v-if="!list.length" class="bf-card empty">{{ t('noTx') }}</div>
    <button v-if="list.length > limit" type="button" class="bf-btn bf-btn--secondary" @click="limit += 100">…</button>
  </main>
</template>
