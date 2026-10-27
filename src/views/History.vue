<script setup>
// Istoricul modificărilor: cine a adăugat, schimbat sau șters ceva, cu posibilitatea de a reface ce s-a șters
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { S, memberById, accountById, categoryById, restoreRow } from '../store.js'
import { t, catName, lang } from '../lib/i18n.js'
import { money, dateShort } from '../lib/format.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const rows = ref([])
const busy = ref(false)
const done = ref(false)
const failed = ref(false)
const filter = ref('all')
const PAGE = 60

async function load(more = false) {
  if (busy.value) return
  busy.value = true; failed.value = false
  try {
    let q = supabase.from('audit_log').select('*').eq('family_id', S.family.id).order('id', { ascending: false }).limit(PAGE)
    if (more && rows.value.length) q = q.lt('id', rows.value.at(-1).id)
    const { data, error } = await q
    if (error) throw error
    rows.value = more ? [...rows.value, ...data] : data
    done.value = data.length < PAGE
  } catch (e) { console.error(e); failed.value = true } finally { busy.value = false }
}
onMounted(() => load())

const TBL = { transactions: 'list', accounts: 'card', categories: 'chart', loans: 'bank', investments: 'chart', debts: 'users', goals: 'piggy', recurring: 'clock', cars: 'car', car_events: 'car', tasks: 'check' }
const KEY = { transactions: 'transactions', car_events: 'carEvents', debts: 'debts', goals: 'goals', recurring: 'recurring', investments: 'investments', tasks: 'tasks' }

function curOf(r) { return accountById(r.account_id)?.currency || r.currency || 'MDL' }
function label(tbl, r) {
  if (!r) return ''
  if (tbl === 'transactions') {
    const what = r.merchant || (r.category_id ? catName(categoryById(r.category_id)) : '') || t('kind_' + r.kind)
    const sign = r.kind === 'income' ? '+' : r.kind === 'expense' ? '−' : ''
    return `${what} · ${sign}${money(r.amount)} ${curOf(r)}`
  }
  if (tbl === 'categories') return catName(r)
  return [r.name || r.title || r.person || '', r.amount ? `${money(r.amount)} ${r.currency || ''}` : ''].filter(Boolean).join(' · ')
}

// Ce s-a schimbat, pe înțeles
const FIELDS = ['done', 'due_date', 'assignee_id', 'amount', 'date', 'merchant', 'category_id', 'account_id', 'kind', 'note', 'name', 'title', 'budget', 'rate', 'opening_balance', 'due_date', 'current_value', 'status', 'archived']
function show(field, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (field === 'category_id') return catName(categoryById(v)) || '—'
  if (field === 'account_id') return accountById(v)?.name || '—'
  if (field === 'date' || field === 'due_date') return dateShort(v, true)
  if (field === 'kind') return t('kind_' + v)
  if (field === 'archived' || field === 'done') return v ? t('yes') : t('no')
  if (field === 'assignee_id') return memberById(v)?.name || t('taskAnyone')
  if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v))) return money(v)
  return String(v).slice(0, 40)
}
function changes(r) {
  if (r.action !== 'update' || !r.old_row || !r.new_row) return []
  return FIELDS.filter((f) => f in r.new_row && JSON.stringify(r.old_row[f]) !== JSON.stringify(r.new_row[f]))
    .map((f) => ({ f, label: t('fld_' + f), from: show(f, r.old_row[f]), to: show(f, r.new_row[f]) }))
}

const list = computed(() => rows.value
  .filter((r) => filter.value === 'all' || r.action === 'delete')
  .filter((r) => r.action !== 'update' || changes(r).length)
  .map((r) => {
    const row = r.new_row || r.old_row
    const m = memberById(r.member_id)
    const key = KEY[r.tbl]
    return {
      ...r, row, m,
      icon: TBL[r.tbl] || 'list',
      text: label(r.tbl, row),
      what: t('tbl_' + r.tbl),
      ch: changes(r),
      canRestore: r.action === 'delete' && key && !S[key].some((x) => x.id === r.row_id),
      when: new Date(r.at).toLocaleString(lang.value === 'ru' ? 'ru-RU' : 'ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }
  }))

const restoring = ref('')
async function restore(r) {
  restoring.value = r.id
  try { await restoreRow(r.tbl, r.old_row) } catch (e) { console.error(e); toast(t('restoreFail')) } finally { restoring.value = '' }
}
</script>

<template>
  <main class="page">
    <h1 class="h-title">{{ t('histTitle') }}</h1>
    <div class="bf-chips">
      <button type="button" class="bf-chip" :class="{ 'bf-chip--on': filter === 'all' }" @click="filter = 'all'">{{ t('all') }}</button>
      <button type="button" class="bf-chip" :class="{ 'bf-chip--on': filter === 'delete' }" @click="filter = 'delete'">{{ t('histDeleted') }}</button>
    </div>

    <div v-if="failed" class="bf-card empty stack">
      <span>{{ t('histFail') }}</span>
      <button type="button" class="bf-btn bf-btn--secondary" @click="load()">{{ t('retry') }}</button>
    </div>
    <div v-else-if="!busy && !list.length" class="bf-card empty">{{ t('histEmpty') }}</div>

    <div v-if="list.length" class="bf-list">
      <div v-for="r in list" :key="r.id" class="bf-row" style="align-items: flex-start;">
        <div class="bf-row__icon" :style="r.action === 'delete' ? 'background: var(--danger-soft); color: var(--danger);' : ''"><Icon :name="r.icon" /></div>
        <div class="bf-row__body">
          <div class="bf-row__title">{{ r.text || r.what }}</div>
          <div class="bf-row__sub">
            <span v-if="r.m" :class="`bf-dot bf-p${r.m.color}`"></span>{{ r.m ? r.m.name : t('histAuto') }} · {{ t('act_' + r.action) }} · {{ r.what }}
          </div>
          <div v-for="c in r.ch" :key="c.f" class="bf-row__sub" style="margin-top: 2px;">{{ c.label }}: <s>{{ c.from }}</s> → <b>{{ c.to }}</b></div>
          <button v-if="r.canRestore" type="button" class="link" style="padding: 6px 0 0;" :disabled="restoring === r.id" @click="restore(r)">{{ t('restore') }}</button>
        </div>
        <span class="cap" style="white-space: nowrap;">{{ r.when }}</span>
      </div>
    </div>

    <button v-if="!done && list.length" type="button" class="bf-btn bf-btn--secondary" :disabled="busy" @click="load(true)">{{ t('showMore') }}</button>
    <div v-if="busy" style="display: grid; place-items: center; padding: 16px;"><div class="spinner" role="status" :aria-label="t('loading')"></div></div>
    <p class="hint">{{ t('histHint') }}</p>
  </main>
</template>
