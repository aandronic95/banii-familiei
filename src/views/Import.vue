<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, activeAccounts, accountById } from '../store.js'
import { supabase } from '../lib/supabase.js'
import { t, catName } from '../lib/i18n.js'
import { money, dateShort } from '../lib/format.js'
import { parseCSV, detectColumns, toTransactions } from '../lib/csv.js'
import { guessCategoryIcon } from '../../supabase/functions/_shared/wallet.ts'
import { haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const fileInput = ref(null)
const rows = ref([])
const cols = ref(null)
const accountId = ref(activeAccounts.value.find((a) => a.type === 'card')?.id || activeAccounts.value[0]?.id || '')
const err = ref('')
const busy = ref(false)
const fileName = ref('')

async function pick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  err.value = ''
  fileName.value = file.name
  try {
    const buf = await file.arrayBuffer()
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.includes('�')) text = new TextDecoder('windows-1251').decode(buf) // extrase vechi în chirilică
    const parsed = parseCSV(text)
    const c = detectColumns(parsed.rows)
    if (!c) throw new Error('cols')
    rows.value = parsed.rows
    cols.value = c
    // Revolut: alege singur contul Revolut
    if (/revolut/i.test(file.name) || parsed.rows[c.headerRow].some((h) => /^product$/i.test(h))) {
      const rev = activeAccounts.value.find((a) => /revolut/i.test(a.name + ' ' + (a.bank || '')))
      if (rev) accountId.value = rev.id
    }
  } catch (_) { err.value = t('importBadFile'); rows.value = []; cols.value = null }
}

const header = computed(() => (cols.value ? rows.value[cols.value.headerRow] : []))
const parsedTx = computed(() => (cols.value ? toTransactions(rows.value, cols.value) : []))

// Categoria: ce s-a folosit ultima dată la aceeași descriere, altfel după cuvinte-cheie
const learned = computed(() => {
  const m = {}
  for (const x of [...S.transactions].sort((a, b) => a.created_at.localeCompare(b.created_at))) if (x.merchant && x.category_id) m[x.merchant.toLowerCase()] = x.category_id
  return m
})
function guessCat(desc, kind) {
  const hit = learned.value[(desc || '').toLowerCase()]
  if (hit) return hit
  if (kind !== 'expense') return null
  const icon = guessCategoryIcon(desc)
  return icon ? S.categories.find((c) => c.kind === 'expense' && c.icon === icon && !c.archived)?.id || null : null
}

const preview = computed(() => {
  const existing = new Set(S.transactions.filter((x) => x.account_id === accountId.value).map((x) => `${x.date}|${Number(x.amount).toFixed(2)}|${x.kind}`))
  return parsedTx.value.map((x) => {
    const dup = existing.has(`${x.date}|${x.amount.toFixed(2)}|${x.kind}`)
    return { ...x, dup, category_id: guessCat(x.description, x.kind), on: !dup }
  })
})
const selected = ref([])
watch(preview, (p) => { selected.value = p.map((x) => x.on) }, { immediate: true })
const toImport = computed(() => preview.value.filter((_, i) => selected.value[i]))
const dupCount = computed(() => preview.value.filter((x) => x.dup).length)

async function doImport() {
  if (!toImport.value.length || busy.value) return
  busy.value = true
  try {
    const rowsToInsert = toImport.value.map((x) => ({
      family_id: S.family.id, kind: x.kind, amount: x.amount, account_id: accountId.value, category_id: x.category_id,
      member_id: accountById(accountId.value)?.member_id || me.value?.id || null, date: x.date, merchant: x.description || null,
      note: 'Import ' + (fileName.value || 'CSV').slice(0, 40),
    }))
    let count = 0
    for (let i = 0; i < rowsToInsert.length; i += 200) {
      const { data, error } = await supabase.from('transactions').insert(rowsToInsert.slice(i, i + 200)).select()
      if (error) throw error
      for (const r of data) if (!S.transactions.some((x) => x.id === r.id)) S.transactions.push(r)
      count += data.length
    }
    haptic('success'); toast(t('importDone', count))
    router.push({ path: '/transactions', query: { account: accountId.value } })
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}
const catOf = (id) => S.categories.find((c) => c.id === id)
</script>

<template>
  <main class="page page--form">
    <div>
      <h1 class="h-title">{{ t('importTitle') }}</h1>
      <p class="muted" style="margin: 4px 0 0; font: 500 14px/20px var(--font-sans);">{{ t('importHint') }}</p>
    </div>

    <div class="fld">
      <label for="im-acc">{{ t('importAccount') }}</label>
      <select id="im-acc" v-model="accountId" class="inp"><option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ a.name }} · {{ a.currency }}</option></select>
    </div>

    <input ref="fileInput" type="file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel" class="file-hidden" @change="pick">
    <button type="button" class="bf-btn bf-btn--secondary bf-btn--block" style="height: 56px; border: 1.5px dashed var(--line);" @click="fileInput.click()">
      <Icon name="list" />{{ fileName || t('importPick') }}
    </button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>

    <template v-if="cols">
      <details class="bf-card">
        <summary class="h-sec" style="cursor: pointer;">{{ t('importColumns') }}</summary>
        <div class="stack" style="margin-top: 12px;">
          <div v-for="k in ['date', 'amount', 'debit', 'credit', 'desc']" :key="k" class="fld">
            <label :for="'c-' + k">{{ t({ date: 'colDate', amount: 'colAmount', debit: 'colOut', credit: 'colIn', desc: 'colDesc' }[k]) }}</label>
            <select :id="'c-' + k" v-model.number="cols[k]" class="inp">
              <option :value="-1">{{ t('colNone') }}</option>
              <option v-for="(h, i) in header" :key="i" :value="i">{{ h || '#' + (i + 1) }}</option>
            </select>
          </div>
        </div>
      </details>

      <div class="bf-banner" style="background: var(--brand-soft);">
        <Icon name="check" />
        <div><b>{{ t('importPreview', toImport.length, dupCount) }}</b></div>
      </div>
      <div v-if="!preview.length" class="bf-card empty">{{ t('importNothing') }}</div>

      <div v-if="preview.length" class="bf-list">
        <label v-for="(x, i) in preview.slice(0, 300)" :key="i" class="bf-row" :for="'im-' + i" :style="{ opacity: selected[i] ? 1 : 0.5 }">
          <input :id="'im-' + i" v-model="selected[i]" type="checkbox" style="width: 20px; height: 20px; accent-color: var(--brand); flex: none;">
          <div class="bf-row__body">
            <div class="bf-row__title">{{ x.description || t(x.kind) }}</div>
            <div class="bf-row__sub">{{ dateShort(x.date) }} · {{ catName(catOf(x.category_id)) || '—' }}<span v-if="x.dup"> · {{ t('importDup') }}</span></div>
          </div>
          <div class="bf-row__amount" :class="x.kind === 'income' ? 'bf-income' : 'bf-expense'">{{ x.kind === 'income' ? '+' : '−' }}{{ money(x.amount) }}</div>
        </label>
      </div>
    </template>

    <div v-if="cols" class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--primary bf-btn--block" :disabled="busy || !toImport.length" @click="doImport">{{ t('importDo', toImport.length) }}</button>
    </div></div>
  </main>
</template>
