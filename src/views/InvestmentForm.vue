<script setup>
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, me, save, remove, activeAccounts, balances, investStatus } from '../store.js'
import { t } from '../lib/i18n.js'
import { parseAmount, todayISO, money } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.investments.find((i) => i.id === route.params.id)
const num = (v) => (v === null || v === undefined || v === '' ? '' : String(Number(v)).replace('.', ','))
const KINDS = ['gov_bond', 'tbill', 'p2p', 'stocks', 'other']
const PLATFORMS = computed(() => [...new Set(['eVMS', 'Fagura', 'Revolut', ...S.investments.map((i) => i.platform).filter(Boolean)])])

const f = reactive({
  kind: orig?.kind ?? 'gov_bond',
  platform: orig?.platform ?? 'eVMS',
  name: orig?.name ?? '',
  code: orig?.code ?? '',
  currency: orig?.currency ?? 'MDL',
  amount: num(orig?.amount),
  units: num(orig?.units),
  rate: num(orig?.rate),
  start_date: orig?.start_date ?? todayISO(),
  maturity_date: orig?.maturity_date ?? '',
  current_value: num(orig?.current_value),
  status: orig?.status ?? 'active',
  member_id: orig?.member_id ?? me.value?.id ?? '',
  account_id: orig?.account_id ?? '',
  note: orig?.note ?? '',
})
const pay = ref('')          // contul din care se plătește (doar la creare)
const busy = ref(false)
const err = ref('')
const close = reactive({ open: false, account_id: orig?.account_id || activeAccounts.value[0]?.id || '', amount: num(orig?.current_value ?? orig?.amount) })

function pickKind(k) {
  const prev = t('invKind_' + f.kind)
  f.kind = k
  if (!f.name || f.name === prev) f.name = t('invKind_' + k)
  if (k === 'p2p' && (!f.platform || f.platform === 'eVMS')) f.platform = 'Fagura'
  if ((k === 'gov_bond' || k === 'tbill') && (!f.platform || f.platform === 'Fagura')) { f.platform = 'eVMS'; f.currency = 'MDL' }
  if (k === 'p2p') f.currency = 'EUR'
}
if (isNew && !f.name) f.name = t('invKind_' + f.kind)

// Previzualizare: cât s-a acumulat până azi și cât va fi la scadență
const preview = computed(() => {
  const amount = parseAmount(f.amount)
  if (!(amount > 0)) return null
  return investStatus({ id: orig?.id || '_', kind: f.kind, amount, rate: parseAmount(f.rate) || null, start_date: f.start_date || todayISO(), maturity_date: f.maturity_date || null, current_value: f.current_value === '' ? null : parseAmount(f.current_value), status: f.status, currency: f.currency })
})
const accLabel = (a) => `${a.name} · ${money(balances.value[a.id])} ${a.currency}`
const payAccounts = computed(() => activeAccounts.value.filter((a) => a.currency === f.currency))

async function submit() {
  err.value = ''
  const amount = parseAmount(f.amount)
  if (!f.name.trim() || !(amount > 0)) { err.value = t('amountRequired2'); return }
  busy.value = true
  try {
    const row = await save('investments', {
      ...(orig ? { id: orig.id } : {}),
      kind: f.kind, platform: f.platform.trim() || null, name: f.name.trim(), code: f.code.trim() || null, currency: f.currency,
      amount, units: parseAmount(f.units) || null, rate: f.rate === '' ? null : parseAmount(f.rate),
      start_date: f.start_date || todayISO(), maturity_date: f.maturity_date || null,
      current_value: f.current_value === '' ? null : parseAmount(f.current_value), value_date: f.current_value === '' ? null : todayISO(),
      status: f.status, member_id: f.member_id || null, account_id: f.account_id || pay.value || null, note: f.note.trim() || null,
    })
    if (isNew && pay.value) {
      await save('transactions', {
        kind: 'invest', amount, account_id: pay.value, member_id: f.member_id || null, date: f.start_date || todayISO(),
        merchant: [f.platform, f.name].filter(Boolean).join(' · '), investment_id: row.id,
      })
    }
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}

function collect() {
  router.push({ path: '/tx/new', query: { kind: 'income', investment: orig.id, category: S.categories.find((c) => c.kind === 'income' && c.icon === 'percent')?.id || '', account: orig.account_id || '' } })
}

async function doClose() {
  const amount = parseAmount(close.amount)
  if (!(await confirmDialog(t('closeConfirm')))) return
  busy.value = true
  try {
    if (close.account_id && amount > 0) {
      await save('transactions', {
        kind: 'divest', amount, account_id: close.account_id, member_id: orig.member_id || me.value?.id || null, date: todayISO(),
        merchant: [orig.platform, orig.name].filter(Boolean).join(' · '), investment_id: orig.id,
      })
    }
    await save('investments', { id: orig.id, status: 'closed' })
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}

async function del() {
  if (!(await confirmDialog(t('delete') + '?'))) return
  try { await remove('investments', orig.id); router.back() } catch (e) { console.error(e); err.value = t('error', e) }
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ isNew ? t('newInvestment') : t('editInvestment') }}</h1>

    <div class="fld">
      <span class="lbl">{{ t('type') }}</span>
      <div class="bf-chips">
        <button v-for="k in KINDS" :key="k" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.kind === k }" @click="pickKind(k)">{{ t('invKind_' + k) }}</button>
      </div>
    </div>

    <div class="grid2">
      <div class="fld">
        <label for="i-pl">{{ t('platform') }}</label>
        <input id="i-pl" v-model="f.platform" class="inp" list="i-pl-list" maxlength="30">
        <datalist id="i-pl-list"><option v-for="p in PLATFORMS" :key="p" :value="p"></option></datalist>
      </div>
      <div class="fld">
        <label for="i-cur">{{ t('currency') }}</label>
        <select id="i-cur" v-model="f.currency" class="inp"><option>MDL</option><option>EUR</option><option>USD</option></select>
      </div>
    </div>
    <div class="fld"><label for="i-n">{{ t('invName') }}</label><input id="i-n" v-model="f.name" class="inp" maxlength="50"></div>
    <div class="fld"><label for="i-c">{{ t('invCode') }}</label><input id="i-c" v-model="f.code" class="inp" maxlength="40" :placeholder="f.kind === 'p2p' ? '092616781801' : 'MD4004002722'"></div>

    <div class="grid2">
      <div class="fld"><label for="i-a">{{ t('invInvested') }}, {{ f.currency }}</label><input id="i-a" v-model="f.amount" class="inp" inputmode="decimal"></div>
      <div v-if="f.kind === 'gov_bond' || f.kind === 'tbill' || f.kind === 'stocks'" class="fld"><label for="i-u">{{ t('units') }}</label><input id="i-u" v-model="f.units" class="inp" inputmode="decimal"></div>
      <div v-else class="fld"><label for="i-r">{{ t('invRate') }}</label><input id="i-r" v-model="f.rate" class="inp" inputmode="decimal"></div>
    </div>
    <div v-if="f.kind === 'gov_bond' || f.kind === 'tbill'" class="fld"><label for="i-r2">{{ t('invRate') }}</label><input id="i-r2" v-model="f.rate" class="inp" inputmode="decimal" placeholder="7,45"></div>

    <div class="grid2">
      <div class="fld"><label for="i-s">{{ t('startDate') }}</label><input id="i-s" v-model="f.start_date" type="date" class="inp"></div>
      <div v-if="f.kind !== 'stocks'" class="fld"><label for="i-m">{{ t('maturityDate') }}</label><input id="i-m" v-model="f.maturity_date" type="date" class="inp"></div>
    </div>

    <div class="fld">
      <label for="i-v">{{ t('currentValue') }}, {{ f.currency }}</label>
      <input id="i-v" v-model="f.current_value" class="inp" inputmode="decimal" :placeholder="t('optional')">
      <span class="hint">{{ t('currentValueHint') }}</span>
    </div>

    <div v-if="preview" class="bf-card stack">
      <div class="kv"><span class="muted">{{ t('invValue') }}</span><b>{{ money(preview.value) }} {{ f.currency }}</b></div>
      <div v-if="preview.accrued" class="kv"><span class="muted">{{ t('invProfit') }} ({{ t('accruedSoFar') }})</span><b class="bf-income">+{{ money(preview.accrued) }}</b></div>
      <div v-if="preview.expectedAtMaturity" class="kv"><span class="muted">{{ t('expectedAtMaturity') }}</span><b>+{{ money(preview.expectedAtMaturity) }}</b></div>
      <div v-if="!isNew && investStatus(orig).received" class="kv"><span class="muted">{{ t('invReceived') }}</span><b class="bf-income">+{{ money(investStatus(orig).received) }}</b></div>
    </div>

    <div class="fld">
      <span class="lbl">{{ t('invStatus') }}</span>
      <div class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
        <button type="button" :class="{ on: f.status === 'active' }" @click="f.status = 'active'">{{ t('stActive') }}</button>
        <button type="button" :class="{ on: f.status === 'late' }" @click="f.status = 'late'">{{ t('stLate') }}</button>
        <button type="button" :class="{ on: f.status === 'closed' }" @click="f.status = 'closed'">{{ t('stClosed') }}</button>
      </div>
    </div>

    <div class="fld">
      <label for="i-mem">{{ t('owner') }}</label>
      <select id="i-mem" v-model="f.member_id" class="inp">
        <option value="">{{ t('common') }}</option>
        <option v-for="m in S.members" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </div>

    <div v-if="isNew" class="fld">
      <label for="i-pay">{{ t('paidFrom') }}</label>
      <select id="i-pay" v-model="pay" class="inp">
        <option value="">{{ t('notFromAccount') }}</option>
        <option v-for="a in payAccounts" :key="a.id" :value="a.id">{{ accLabel(a) }}</option>
      </select>
      <span class="hint">{{ t('paidFromHint') }}</span>
    </div>

    <div class="fld"><label for="i-note">{{ t('note') }}</label><input id="i-note" v-model="f.note" class="inp" :placeholder="t('optional')" maxlength="200"></div>

    <template v-if="!isNew && orig.status !== 'closed'">
      <button type="button" class="bf-btn bf-btn--secondary" @click="collect"><Icon name="percent" />{{ t('collectInterest') }}</button>
      <button v-if="!close.open" type="button" class="bf-btn bf-btn--secondary" @click="close.open = true"><Icon name="check" />{{ t('closeInvestment') }}</button>
      <div v-else class="bf-card stack">
        <h2 class="h-sec">{{ t('closeInvestment') }}</h2>
        <p class="hint" style="margin: 0;">{{ t('closeHint') }}</p>
        <div class="fld">
          <label for="c-acc">{{ t('returnedTo') }}</label>
          <select id="c-acc" v-model="close.account_id" class="inp">
            <option value="">{{ t('notFromAccount') }}</option>
            <option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ accLabel(a) }}</option>
          </select>
        </div>
        <div class="fld"><label for="c-amt">{{ t('amountReturned') }}</label><input id="c-amt" v-model="close.amount" class="inp" inputmode="decimal"></div>
        <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="doClose">{{ t('closeInvestment') }}</button>
      </div>
    </template>

    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del"><Icon name="trash" />{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>

    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
