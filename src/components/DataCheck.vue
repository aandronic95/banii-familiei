<script setup>
// Verificarea datelor: dubluri și transferuri înregistrate ca venit + cheltuială (strică rapoartele)
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, save, remove, accountById, toMdl, txCurrency, savePrefs } from '../store.js'
import { findDuplicates, findHiddenTransfers } from '../lib/checks.js'
import { t } from '../lib/i18n.js'
import { money, money0, dateShort } from '../lib/format.js'
import { toast } from './Toast.js'
import { haptic } from '../lib/telegram.js'
import Icon from './Icon.vue'

const router = useRouter()
const open = ref(false)
const busy = ref('')
const ignored = computed(() => me.value?.prefs?.ignoredChecks || [])
const since = computed(() => new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10))
const recent = computed(() => S.transactions.filter((x) => x.date >= since.value && !x._pending))
const dups = computed(() => findDuplicates(recent.value, { ignored: ignored.value }))
const transfers = computed(() => findHiddenTransfers(recent.value, (x) => toMdl(x.amount, txCurrency(x)), { ignored: ignored.value }))
const uncat = computed(() => {
  const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const l = S.transactions.filter((x) => x.kind === 'expense' && !x.category_id && x.date >= from)
  return { n: l.length, sum: l.reduce((s, x) => s + toMdl(x.amount, txCurrency(x)), 0) }
})
const total = computed(() => dups.value.length + transfers.value.length + (uncat.value.n ? 1 : 0))
const inflated = computed(() => transfers.value.reduce((s, x) => s + toMdl(x.out.amount, txCurrency(x.out)), 0))
const dupSum = computed(() => dups.value.reduce((s, x) => s + toMdl(x.dup.amount, txCurrency(x.dup)), 0))

const line = (x) => `${dateShort(x.date)} · ${x.merchant || '—'} · ${money(x.amount)} ${txCurrency(x)} · ${accountById(x.account_id)?.name || ''}`

async function ignore(key) {
  await savePrefs({ ignoredChecks: [...ignored.value, key].slice(-300) })
}
async function delDup(d) {
  busy.value = d.key
  try { await remove('transactions', d.dup.id); haptic('success') } catch (e) { toast(t('error', e)) } finally { busy.value = '' }
}
// Cheltuiala devine transfer spre celălalt cont, iar venitul pereche dispare
async function makeTransfer(p) {
  busy.value = p.key
  try {
    const sameCur = txCurrency(p.out) === txCurrency(p.in)
    await save('transactions', { id: p.out.id, kind: 'transfer', to_account_id: p.in.account_id, to_amount: sameCur ? null : Number(p.in.amount), category_id: null })
    await remove('transactions', p.in.id, { silent: true })
    haptic('success'); toast(t('chkMadeTransfer'))
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = '' }
}
</script>

<template>
  <section class="bf-card stack" aria-labelledby="chk-h" :style="total ? 'box-shadow: inset 0 0 0 1.5px var(--warning), var(--shadow-card);' : ''">
    <button type="button" class="sec-head" style="all: unset; display: flex; justify-content: space-between; align-items: center; gap: 8px; cursor: pointer;" :aria-expanded="open" @click="open = !open">
      <span style="display: flex; align-items: center; gap: 10px;">
        <Icon :name="total ? 'alert' : 'tick'" :style="{ color: total ? 'var(--warning)' : 'var(--income)' }" />
        <span>
          <h2 id="chk-h" class="h-sec" style="margin: 0;">{{ t('chkTitle') }}</h2>
          <span class="cap">{{ total ? t('chkFound', total) : t('chkOk') }}</span>
        </span>
      </span>
      <span v-if="total" class="chev" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <template v-if="open && total">
      <template v-if="transfers.length">
        <div class="bf-banner"><Icon name="swap" /><div><b>{{ t('chkTransfers', transfers.length) }}</b><div class="cap">{{ t('chkTransfersWhy', money0(inflated)) }}</div></div></div>
        <div v-for="p in transfers" :key="p.key" class="chk">
          <div class="cap"><span class="bf-expense">−</span> {{ line(p.out) }}</div>
          <div class="cap"><span class="bf-income">+</span> {{ line(p.in) }}</div>
          <div class="chk__act">
            <button type="button" class="bf-btn bf-btn--primary" style="min-height: 36px;" :disabled="busy === p.key" @click="makeTransfer(p)">{{ t('chkMakeTransfer') }}</button>
            <button type="button" class="link" style="padding: 0;" @click="ignore(p.key)">{{ t('chkNotTransfer') }}</button>
          </div>
        </div>
      </template>

      <template v-if="dups.length">
        <div class="bf-banner"><Icon name="list" /><div><b>{{ t('chkDups', dups.length) }}</b><div class="cap">{{ t('chkDupsWhy', money0(dupSum)) }}</div></div></div>
        <div v-for="d in dups" :key="d.key" class="chk">
          <button type="button" class="cap" style="all: unset; cursor: pointer; display: block;" @click="router.push('/tx/' + d.keep.id)">1. {{ line(d.keep) }}</button>
          <button type="button" class="cap" style="all: unset; cursor: pointer; display: block;" @click="router.push('/tx/' + d.dup.id)">2. {{ line(d.dup) }}</button>
          <div class="chk__act">
            <button type="button" class="bf-btn bf-btn--danger" style="min-height: 36px;" :disabled="busy === d.key" @click="delDup(d)">{{ t('chkDelDup') }}</button>
            <button type="button" class="link" style="padding: 0;" @click="ignore(d.key)">{{ t('chkNotDup') }}</button>
          </div>
        </div>
      </template>

      <button v-if="uncat.n" type="button" class="bf-banner" style="border: 0; text-align: left; cursor: pointer;" @click="router.push({ path: '/transactions', query: { uncat: '1' } })">
        <Icon name="tag" /><div style="flex: 1;"><b>{{ t('chkUncat', uncat.n) }}</b><div class="cap">{{ t('chkUncatWhy', money0(uncat.sum)) }}</div></div><span class="chev">›</span>
      </button>
    </template>
  </section>
</template>
