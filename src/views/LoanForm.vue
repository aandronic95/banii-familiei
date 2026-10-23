<script setup>
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, save, remove } from '../store.js'
import { t } from '../lib/i18n.js'
import { parseAmount, money0, todayISO } from '../lib/format.js'
import { schedule } from '../lib/loan.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.loans.find((l) => l.id === route.params.id)
const num = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
const f = reactive({
  name: orig?.name ?? '', type: orig?.type ?? 'mortgage', bank: orig?.bank ?? '', currency: orig?.currency ?? 'MDL',
  principal: num(orig?.principal), annual_rate: num(orig?.annual_rate), term_months: orig?.term_months ?? '',
  first_due: orig?.first_due ?? todayISO(), paid_before: orig?.paid_before ?? 0, monthly_payment: num(orig?.monthly_payment),
  account_id: orig?.account_id ?? '', closed: orig?.closed ?? false,
})
const busy = ref(false)
const err = ref('')
const preview = computed(() => {
  const P = parseAmount(f.principal), n = parseInt(f.term_months)
  if (!(P > 0 && n > 0)) return null
  const s = schedule({ principal: P, annual_rate: parseAmount(f.annual_rate), term_months: n, first_due: f.first_due || todayISO(), monthly_payment: parseAmount(f.monthly_payment) || null })
  return { payment: s[0]?.payment || 0, total: s.reduce((a, x) => a + x.payment, 0) }
})

async function submit() {
  err.value = ''
  const P = parseAmount(f.principal), n = parseInt(f.term_months)
  if (!f.name.trim() || !(P > 0) || !(n > 0) || !f.first_due) { err.value = t('loanRequired'); return }
  busy.value = true
  try {
    await save('loans', {
      ...(orig ? { id: orig.id } : {}),
      name: f.name.trim(), type: f.type, bank: f.bank.trim() || null, currency: f.currency, principal: P,
      annual_rate: parseAmount(f.annual_rate), term_months: n, first_due: f.first_due,
      paid_before: Math.max(0, parseInt(f.paid_before) || 0), monthly_payment: parseAmount(f.monthly_payment) || null,
      account_id: f.account_id || null, closed: !!f.closed,
    })
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}
async function del() {
  if (!(await confirmDialog(t('delete') + '?'))) return
  await remove('loans', orig.id)
  router.back()
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ isNew ? t('newLoan') : t('editLoan') }}</h1>
    <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
      <button type="button" :class="{ on: f.type === 'mortgage' }" @click="f.type = 'mortgage'">{{ t('mortgage') }}</button>
      <button type="button" :class="{ on: f.type === 'consumer' }" @click="f.type = 'consumer'">{{ t('consumer') }}</button>
    </div>
    <div class="fld"><label for="l-name">{{ t('name') }}</label><input id="l-name" v-model="f.name" class="inp" maxlength="40" :placeholder="t(f.type)"></div>
    <div class="grid2">
      <div class="fld"><label for="l-bank">{{ t('bank') }}</label><input id="l-bank" v-model="f.bank" class="inp" maxlength="30"></div>
      <div class="fld"><label for="l-cur">{{ t('currency') }}</label><select id="l-cur" v-model="f.currency" class="inp"><option>MDL</option><option>EUR</option><option>USD</option></select></div>
    </div>
    <div class="grid2">
      <div class="fld"><label for="l-p">{{ t('principal') }}</label><input id="l-p" v-model="f.principal" class="inp" inputmode="decimal"></div>
      <div class="fld"><label for="l-r">{{ t('interest') }}</label><input id="l-r" v-model="f.annual_rate" class="inp" inputmode="decimal"></div>
    </div>
    <div class="grid2">
      <div class="fld"><label for="l-n">{{ t('termMonths') }}</label><input id="l-n" v-model="f.term_months" class="inp" inputmode="numeric"></div>
      <div class="fld"><label for="l-d">{{ t('firstDue') }}</label><input id="l-d" v-model="f.first_due" type="date" class="inp"></div>
    </div>
    <div class="grid2">
      <div class="fld"><label for="l-pb">{{ t('paidBefore') }}</label><input id="l-pb" v-model="f.paid_before" class="inp" inputmode="numeric"></div>
      <div class="fld"><label for="l-mp">{{ t('monthlyPayment') }}</label><input id="l-mp" v-model="f.monthly_payment" class="inp" inputmode="decimal"></div>
    </div>
    <p class="hint">{{ t('monthlyPaymentHint') }}</p>
    <div class="fld">
      <label for="l-acc">{{ t('payFrom') }}</label>
      <select id="l-acc" v-model="f.account_id" class="inp">
        <option value="">—</option>
        <option v-for="a in S.accounts.filter((x) => !x.archived && x.type !== 'asset')" :key="a.id" :value="a.id">{{ a.name }} · {{ a.currency }}</option>
      </select>
    </div>
    <div v-if="preview" class="bf-card stack">
      <div class="kv"><span class="muted">{{ t('payment') }}</span><b>{{ money0(preview.payment) }} {{ f.currency }}</b></div>
      <div class="kv"><span class="muted">Total</span><b>{{ money0(preview.total) }} {{ f.currency }}</b></div>
    </div>
    <label v-if="!isNew" class="bf-row bf-list" for="l-cl">
      <div class="bf-row__body"><div class="bf-row__title">{{ t('closeLoan') }}</div></div>
      <input id="l-cl" v-model="f.closed" type="checkbox" class="sw">
    </label>
    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del">{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
