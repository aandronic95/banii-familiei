<script setup>
// Lista de dorințe: ce vreți să cumpărați, cu preț și prioritate; devine obiectiv sau cheltuială
import { CURRENCIES, FX } from '../lib/currencies.js'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, save, remove, memberById, toMdl, goalProgress, txCurrency, accountById } from '../store.js'
import { wishCandidates } from '../lib/wishmatch.js'
import { t } from '../lib/i18n.js'
import { money0, money, parseAmount, dateShort, todayISO } from '../lib/format.js'
import { haptic, confirmDialog, openLink } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const showDone = ref(false)
const list = computed(() => S.wishes.filter((w) => !!w.done === showDone.value)
  .sort((a, b) => a.priority - b.priority || (b.created_at || '').localeCompare(a.created_at || '')))
const total = computed(() => S.wishes.filter((w) => !w.done).reduce((s, w) => s + toMdl(Number(w.price) || 0, w.currency), 0))
const goalOf = (w) => (w.goal_id ? S.goals.find((g) => g.id === w.goal_id) : null)

const edit = ref(null)
function openEdit(w) {
  edit.value = w ? { id: w.id, title: w.title, price: w.price != null ? String(Number(w.price)).replace('.', ',') : '', currency: w.currency, priority: w.priority, member_id: w.member_id || '', link: w.link || '', note: w.note || '' }
    : { title: '', price: '', currency: 'MDL', priority: 2, member_id: '', link: '', note: '' }
}
async function saveWish() {
  const e = edit.value
  if (!e.title.trim()) return
  const link = e.link.trim()
  await save('wishes', { ...(e.id ? { id: e.id } : {}), title: e.title.trim().slice(0, 80), price: parseAmount(e.price) > 0 ? parseAmount(e.price) : null, currency: e.currency,
    priority: e.priority, member_id: e.member_id || null, link: /^https?:\/\//i.test(link) ? link : null, note: e.note.trim() || null })
  edit.value = null
  haptic('success')
}
// Devine obiectiv de economii (cu progres), legat de dorință
async function toGoal(w) {
  const g = await save('goals', { name: w.title.slice(0, 60), target: Number(w.price) || 0, currency: w.currency, saved: 0, member_id: w.member_id || null, icon: 'star', done: false })
  await save('wishes', { id: w.id, goal_id: g.id })
  toast(t('wishGoalMade'))
  router.push('/goal/' + g.id)
}
// Cumpărat: dacă ai plătit deja, alegi cheltuiala făcută (fără a doua scădere din cont); altfel o adaugi acum
const buy = ref(null) // dorința pentru care alegem cheltuiala
const buyQ = ref('')
const showAll = ref(false)
function bought(w) { buy.value = w; buyQ.value = ''; showAll.value = false }
const txsMdl = computed(() => S.transactions.map((x) => ({ ...x, mdl: toMdl(Number(x.amount), txCurrency(x)) })))
const cands = computed(() => {
  const w = buy.value
  if (!w) return []
  const list = wishCandidates({ title: w.title, priceMdl: w.price ? toMdl(Number(w.price), w.currency) : 0, created_at: w.created_at }, txsMdl.value, todayISO(), { query: buyQ.value })
  const linked = new Set(S.wishes.filter((x) => x.tx_id).map((x) => x.tx_id))
  const free = list.filter((c) => !linked.has(c.tx.id))
  return buyQ.value || showAll.value ? free.slice(0, 30) : free.filter((c) => c.score >= 0.6).slice(0, 5)
})
async function linkTx(w, x) {
  await save('wishes', { id: w.id, done: true, done_at: new Date().toISOString(), tx_id: x.id })
  buy.value = null
  haptic('success'); toast(t('wishLinked'))
}
async function buyNew(w) {
  await save('wishes', { id: w.id, done: true, done_at: new Date().toISOString() })
  buy.value = null
  router.push({ path: '/tx/new', query: { amount: w.price ? String(w.price) : undefined, merchantText: w.title, wish: w.id } })
}
async function justDone(w) {
  await save('wishes', { id: w.id, done: true, done_at: new Date().toISOString() })
  buy.value = null
  haptic('success')
}
async function undone(w) { await save('wishes', { id: w.id, done: false, done_at: null, tx_id: null }) }
const txOf = (w) => (w.tx_id ? S.transactions.find((x) => x.id === w.tx_id) : null)
async function del(w) {
  if (!(await confirmDialog(t('wishDeleteQ', w.title)))) return
  await remove('wishes', w.id)
}
const PRIO = { 1: { label: 'wishP1', color: 'var(--danger)' }, 2: { label: 'wishP2', color: 'var(--warning)' }, 3: { label: 'wishP3', color: 'var(--ink-muted)' } }
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('wishTitle') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="openEdit(null)"><Icon name="plus" />{{ t('add') }}</button>
    </div>
    <div v-if="total" class="bf-card">
      <div class="bf-balance__label">{{ t('wishTotal') }}</div>
      <div class="bf-balance__amount" style="font-size: 28px;">{{ money0(total) }}<span class="bf-balance__cur">MDL</span></div>
    </div>

    <div v-if="edit" class="bf-card stack">
      <div class="fld"><label for="w-t">{{ t('wishWhat') }}</label><input id="w-t" v-model="edit.title" class="inp" maxlength="80" :placeholder="t('wishPh')"></div>
      <div class="grid2">
        <div class="fld"><label for="w-p">{{ t('wishPrice') }}</label><input id="w-p" v-model="edit.price" class="inp" inputmode="decimal" placeholder="0"></div>
        <div class="fld"><span class="lbl">{{ t('currency') }}</span>
          <div class="seg" style="grid-template-columns: repeat(4, minmax(0, 1fr));"><button v-for="c in CURRENCIES" :key="c" type="button" :class="{ on: edit.currency === c }" @click="edit.currency = c">{{ c }}</button></div></div>
      </div>
      <div class="fld"><span class="lbl">{{ t('wishPriority') }}</span>
        <div class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr));"><button v-for="p in [1, 2, 3]" :key="p" type="button" :class="{ on: edit.priority === p }" @click="edit.priority = p">{{ t(PRIO[p].label) }}</button></div></div>
      <div class="fld"><span class="lbl">{{ t('wishFor') }}</span>
        <div class="bf-chips">
          <button type="button" class="bf-chip" :class="{ 'bf-chip--on': !edit.member_id }" @click="edit.member_id = ''">{{ t('common') }}</button>
          <button v-for="m in S.members" :key="m.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': edit.member_id === m.id }" @click="edit.member_id = m.id"><span :class="`bf-dot bf-p${m.color}`"></span>{{ m.name }}</button>
        </div></div>
      <div class="fld"><label for="w-l">{{ t('wishLink') }}</label><input id="w-l" v-model="edit.link" class="inp" inputmode="url" placeholder="https://…"></div>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="bf-btn bf-btn--secondary" @click="edit = null">{{ t('cancel') }}</button>
        <button type="button" class="bf-btn bf-btn--primary" style="flex: 1;" :disabled="!edit.title.trim()" @click="saveWish">{{ t('save') }}</button>
      </div>
    </div>

    <div class="bf-chips">
      <button type="button" class="bf-chip" :class="{ 'bf-chip--on': !showDone }" @click="showDone = false">{{ t('wishOpen') }}</button>
      <button type="button" class="bf-chip" :class="{ 'bf-chip--on': showDone }" @click="showDone = true">{{ t('wishDone') }}</button>
    </div>
    <div v-if="!list.length" class="bf-card empty">{{ showDone ? t('wishNoneDone') : t('wishEmpty') }}</div>
    <div v-for="w in list" :key="w.id" class="bf-card stack" style="padding: 14px 16px;">
      <div class="kv" style="align-items: flex-start; gap: 10px;">
        <div style="min-width: 0;">
          <button type="button" style="all: unset; cursor: pointer; font-weight: 600;" @click="openEdit(w)">{{ w.title }}</button>
          <div class="cap">
            <span :style="{ color: PRIO[w.priority].color, fontWeight: 600 }">{{ t(PRIO[w.priority].label) }}</span>
            <span v-if="memberById(w.member_id)"> · {{ memberById(w.member_id).name }}</span>
            <button v-if="w.link" type="button" class="link" style="padding: 0 0 0 6px;" @click="openLink(w.link)">{{ t('wishOpenLink') }}</button>
          </div>
        </div>
        <b v-if="w.price" style="white-space: nowrap;">{{ money0(w.price) }} {{ w.currency }}</b>
      </div>
      <template v-if="goalOf(w)">
        <div class="bf-bar" style="margin-top: 0;"><i :style="{ width: goalProgress(goalOf(w)).pct * 100 + '%' }"></i></div>
        <div class="cap">{{ t('wishSaved', money0(goalProgress(goalOf(w)).saved), money0(goalProgress(goalOf(w)).target)) }}</div>
      </template>
      <div v-if="buy && buy.id === w.id" class="stack" style="gap: 8px; border-top: 1px solid var(--line); padding-top: 10px;">
        <b>{{ t('wishPaidQ') }}</b>
        <input v-model="buyQ" class="inp" type="search" :placeholder="t('wishSearchTx')" :aria-label="t('wishSearchTx')">
        <button v-for="c in cands" :key="c.tx.id" type="button" class="kv" style="all: unset; cursor: pointer; display: flex; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 12px; background: var(--surface-2);" @click="linkTx(w, c.tx)">
          <span style="min-width: 0;"><span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ c.tx.merchant || '—' }}</span><span class="cap">{{ dateShort(c.tx.date, true) }} · {{ accountById(c.tx.account_id)?.name || '' }}</span></span>
          <b class="bf-expense" style="white-space: nowrap;">−{{ money(c.tx.amount) }} {{ txCurrency(c.tx) }}</b>
        </button>
        <p v-if="!cands.length" class="hint" style="margin: 0;">{{ buyQ ? t('wishNoTxQ') : t('wishNoTx') }}</p>
        <button v-if="!buyQ && !showAll" type="button" class="link" style="padding: 0; justify-self: start;" @click="showAll = true">{{ t('wishAllTx') }}</button>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 38px;" @click="buyNew(w)">{{ t('wishNewTx') }}</button>
          <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 38px;" @click="justDone(w)">{{ t('wishJustDone') }}</button>
          <button type="button" class="link" style="padding: 0;" @click="buy = null">{{ t('cancel') }}</button>
        </div>
      </div>
      <div v-if="w.done" class="cap" style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button v-if="txOf(w)" type="button" class="link" style="padding: 0;" @click="router.push('/tx/' + w.tx_id)">🧾 {{ txOf(w).merchant || '—' }} · {{ dateShort(txOf(w).date, true) }} · −{{ money(txOf(w).amount) }} {{ txCurrency(txOf(w)) }}</button>
        <button type="button" class="link" style="padding: 0;" @click="undone(w)">{{ t('wishUndo') }}</button>
      </div>
      <div v-if="!w.done && !(buy && buy.id === w.id)" style="display: flex; gap: 14px; flex-wrap: wrap;">
        <button v-if="!w.goal_id && w.price" type="button" class="link" style="padding: 0;" @click="toGoal(w)">{{ t('wishToGoal') }}</button>
        <button v-else-if="w.goal_id" type="button" class="link" style="padding: 0;" @click="router.push('/goal/' + w.goal_id)">{{ t('wishSeeGoal') }}</button>
        <button type="button" class="link" style="padding: 0;" @click="bought(w)">{{ t('wishBought') }}</button>
        <button type="button" class="link" style="padding: 0; color: var(--danger);" @click="del(w)">{{ t('delete') }}</button>
      </div>
    </div>
    <p class="hint">{{ t('wishHint') }}</p>
  </main>
</template>
