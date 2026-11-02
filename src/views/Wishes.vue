<script setup>
// Lista de dorințe: ce vreți să cumpărați, cu preț și prioritate; devine obiectiv sau cheltuială
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, save, remove, memberById, toMdl, goalProgress } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, parseAmount } from '../lib/format.js'
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
// Cumpărat: cheltuiala precompletată, dorința bifată
async function bought(w) {
  await save('wishes', { id: w.id, done: true, done_at: new Date().toISOString() })
  router.push({ path: '/tx/new', query: { amount: w.price ? String(w.price) : undefined, merchantText: w.title } })
}
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
          <div class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr));"><button v-for="c in ['MDL', 'EUR', 'USD']" :key="c" type="button" :class="{ on: edit.currency === c }" @click="edit.currency = c">{{ c }}</button></div></div>
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
      <div v-if="!w.done" style="display: flex; gap: 14px; flex-wrap: wrap;">
        <button v-if="!w.goal_id && w.price" type="button" class="link" style="padding: 0;" @click="toGoal(w)">{{ t('wishToGoal') }}</button>
        <button v-else-if="w.goal_id" type="button" class="link" style="padding: 0;" @click="router.push('/goal/' + w.goal_id)">{{ t('wishSeeGoal') }}</button>
        <button type="button" class="link" style="padding: 0;" @click="bought(w)">{{ t('wishBought') }}</button>
        <button type="button" class="link" style="padding: 0; color: var(--danger);" @click="del(w)">{{ t('delete') }}</button>
      </div>
    </div>
    <p class="hint">{{ t('wishHint') }}</p>
  </main>
</template>
