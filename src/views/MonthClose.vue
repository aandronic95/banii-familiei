<script setup>
// Închiderea lunii: o listă scurtă de verificat (categorii, dubluri și datorii, confirmări, solduri) și luna e „bifată”
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, savePrefs, periodSums, monthRange, activeAccounts, balances, catSuggestions, uncategorized, pendingRecurring, pendingPayouts, debtLike, memberById } from '../store.js'
import { t, lang } from '../lib/i18n.js'
import { money0, money, todayISO } from '../lib/format.js'
import { haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import CatSuggest from '../components/CatSuggest.vue'
import DataCheck from '../components/DataCheck.vue'

const router = useRouter()
const today = todayISO()
const prevOf = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
// până pe 20 închidem luna trecută; după, se poate închide și cea curentă
const month = ref(Number(today.slice(8, 10)) <= 20 ? prevOf(today.slice(0, 7)) : today.slice(0, 7))
const label = computed(() => new Date(month.value + '-15').toLocaleDateString(lang.value === 'ru' ? 'ru-RU' : 'ro-RO', { month: 'long', year: 'numeric' }))
const range = computed(() => monthRange(month.value + '-01'))
const sums = computed(() => periodSums(range.value[0], range.value[1]))
const before = computed(() => { const r = monthRange(prevOf(month.value) + '-01'); return periodSums(r[0], r[1]) })
const uncat = computed(() => uncategorized.value.filter((x) => x.date >= range.value[0] && x.date <= range.value[1]))
const confirms = computed(() => pendingRecurring.value.length + pendingPayouts.value.length)
const accs = computed(() => activeAccounts.value.filter((a) => ['card', 'cash'].includes(a.type)))
const okAcc = ref(new Set())
const tick = (id) => { const n = new Set(okAcc.value); n.has(id) ? n.delete(id) : n.add(id); okAcc.value = n }
const closedBy = computed(() => S.members.find((m) => (m.prefs?.closedMonths || []).includes(month.value)) || null)
const left = computed(() => uncat.value.length + debtLike.value.length + confirms.value + accs.value.filter((a) => !okAcc.value.has(a.id)).length)
const diffPct = computed(() => (before.value.exp > 0 ? Math.round(((sums.value.exp - before.value.exp) / before.value.exp) * 100) : null))
async function close() {
  const list = [month.value, ...(me.value?.prefs?.closedMonths || []).filter((m) => m !== month.value)].slice(0, 36)
  try { await savePrefs({ closedMonths: list }); haptic('success'); toast(t('clDone', label.value)) } catch (e) { toast(t('error', e)) }
}
async function reopen() {
  const who = closedBy.value
  if (who?.id !== me.value?.id) return
  await savePrefs({ closedMonths: (me.value.prefs?.closedMonths || []).filter((m) => m !== month.value) })
}
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('clTitle') }}</h1>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button type="button" class="amt-op" style="width: 34px; height: 34px;" :aria-label="t('prevMonth')" @click="month = prevOf(month)">‹</button>
        <b style="text-transform: capitalize; white-space: nowrap;">{{ label }}</b>
      </div>
    </div>

    <div class="bf-card stack">
      <div class="kv"><span class="muted">{{ t('income') }}</span><b class="bf-income">+{{ money0(sums.inc) }}</b></div>
      <div class="kv"><span class="muted">{{ t('expenses') }}</span><b class="bf-expense">−{{ money0(sums.exp) }}<span v-if="diffPct !== null" class="cap"> · {{ diffPct > 0 ? '▲' : '▼' }} {{ Math.abs(diffPct) }}%</span></b></div>
      <div class="kv" style="border-top: 1px solid var(--line); padding-top: 8px;"><b>{{ sums.inc - sums.exp >= 0 ? t('clSaved') : t('clOver') }}</b><b :class="sums.inc - sums.exp >= 0 ? 'bf-income' : 'bf-expense'">{{ money0(Math.abs(sums.inc - sums.exp)) }} MDL</b></div>
    </div>

    <div v-if="closedBy" class="bf-banner" style="background: var(--brand-soft);">
      <div><b>✓ {{ t('clClosed', label) }}</b><div class="cap">{{ closedBy.name }}</div></div>
      <button v-if="closedBy.id === me?.id" type="button" class="link" style="padding: 0;" @click="reopen">{{ t('clReopen') }}</button>
    </div>

    <section class="bf-card stack">
      <div class="kv"><b>1. {{ t('clCats') }}</b><b :style="{ color: uncat.length ? 'var(--warning)' : 'var(--income)' }">{{ uncat.length ? uncat.length : '✓' }}</b></div>
      <CatSuggest />
      <button v-if="uncat.length && uncat.length > catSuggestions.length" type="button" class="link" style="padding: 0; justify-self: start;" @click="router.push({ path: '/transactions', query: { uncat: '1' } })">{{ t('clCatsOpen') }}</button>
      <p v-if="!uncat.length" class="hint" style="margin: 0;">{{ t('clCatsOk') }}</p>
    </section>

    <section class="bf-card stack">
      <div class="kv"><b>2. {{ t('clChecks') }}</b></div>
      <p class="hint" style="margin: 0;">{{ t('clChecksHint') }}</p>
    </section>
    <DataCheck />

    <section class="bf-card stack">
      <div class="kv"><b>3. {{ t('clConfirm') }}</b><b :style="{ color: confirms ? 'var(--warning)' : 'var(--income)' }">{{ confirms || '✓' }}</b></div>
      <button v-if="confirms" type="button" class="link" style="padding: 0; justify-self: start;" @click="router.push('/')">{{ t('clConfirmOpen') }}</button>
      <p v-else class="hint" style="margin: 0;">{{ t('clConfirmOk') }}</p>
    </section>

    <section class="bf-card stack">
      <div class="kv"><b>4. {{ t('clBal') }}</b><b :style="{ color: accs.length - okAcc.size > 0 ? 'var(--warning)' : 'var(--income)' }">{{ accs.length - okAcc.size > 0 ? accs.length - okAcc.size : '✓' }}</b></div>
      <p class="hint" style="margin: 0;">{{ t('clBalHint') }}</p>
      <div v-for="a in accs" :key="a.id" class="kv" style="gap: 8px;">
        <span style="min-width: 0;">{{ a.name }}<span v-if="memberById(a.member_id)" class="cap"> · {{ memberById(a.member_id).name }}</span></span>
        <span style="display: flex; gap: 8px; align-items: center; white-space: nowrap;">
          <b>{{ money(balances[a.id] ?? 0) }} {{ a.currency }}</b>
          <button type="button" class="bf-chip" :class="{ 'bf-chip--on': okAcc.has(a.id) }" :aria-pressed="okAcc.has(a.id)" @click="tick(a.id)">✓</button>
          <button type="button" class="link" style="padding: 0;" @click="router.push('/account/' + a.id)">{{ t('clBalFix') }}</button>
        </span>
      </div>
    </section>

    <button v-if="!closedBy" type="button" class="bf-btn bf-btn--primary" @click="close">{{ left ? t('clCloseAnyway', left) : t('clClose', label) }}</button>
    <p class="hint">{{ t('clHint') }}</p>
  </main>
</template>
