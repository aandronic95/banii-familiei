<script setup>
import { CURRENCIES, FX } from '../lib/currencies.js'
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, me, save, remove, activeAccounts, balances } from '../store.js'
import { t } from '../lib/i18n.js'
import { parseAmount, todayISO, money } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'
import TxRow from '../components/TxRow.vue'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.debts.find((d) => d.id === route.params.id)
if (!isNew && !orig) router.replace('/debts')
const num = (v) => (v === null || v === undefined ? '' : String(Number(v)).replace('.', ','))
const f = reactive({
  direction: orig?.direction ?? 'owed_to_us', person: orig?.person ?? '', amount: num(orig?.amount), currency: orig?.currency ?? 'MDL',
  date: orig?.date ?? todayISO(), due_date: orig?.due_date ?? '', note: orig?.note ?? '', member_id: orig?.member_id ?? me.value?.id ?? '',
})
const viaAccount = ref('') // la creare: banii au trecut printr-un cont
// contul implicit: ultimul folosit la datoria asta, altfel primul card în moneda ei
const lastAcc = orig ? [...S.transactions].filter((x) => x.debt_id === orig.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.account_id : ''
const firstAcc = (cur) => activeAccounts.value.find((a) => a.currency === cur && a.type === 'card')?.id || activeAccounts.value.find((a) => a.currency === cur)?.id || ''
const pay = reactive({ open: false, all: false, amount: orig ? num(Number(orig.amount) - Number(orig.paid)) : '', account_id: lastAcc || (orig ? firstAcc(orig.currency) : '') })
// Mișcările de bani ale datoriei (dat / întors), cu contul lor; se deschid ca să schimbi contul
const moves = computed(() => (orig ? S.transactions.filter((x) => x.debt_id === orig.id).sort((a, b) => b.date.localeCompare(a.date)) : []))
const repaidTx = computed(() => moves.value.filter((x) => x.kind === moveKind(orig.direction, true)).reduce((s2, x) => s2 + Number(x.amount), 0))
// Achitată fără să se spună de pe ce cont: lipsește mișcarea, deci soldul cardului n-a scăzut
const missing = computed(() => (orig ? Math.round((Number(orig.paid) - repaidTx.value) * 100) / 100 : 0))
const fix = reactive({ account_id: pay.account_id })
async function addMissing() {
  if (!fix.account_id || !(missing.value > 0)) return
  busy.value = true
  try {
    await save('transactions', { kind: moveKind(orig.direction, true), amount: missing.value, account_id: fix.account_id, member_id: me.value?.id || null, date: todayISO(), merchant: orig.person, note: t('debtRepaidNote'), debt_id: orig.id })
    haptic('success'); toast(t('saved'))
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}
const err = ref('')
const busy = ref(false)
const accs = computed(() => activeAccounts.value.filter((a) => a.currency === f.currency))
const accLabel = (a) => `${a.name} · ${money(balances.value[a.id])} ${a.currency}`

// Banii împrumutați nu sunt cheltuieli: dăm = „invest” (ies), primim = „divest” (intră)
const moveKind = (dir, paying) => (dir === 'owed_to_us') !== paying ? 'invest' : 'divest'

async function submit() {
  err.value = ''
  const amount = parseAmount(f.amount)
  if (!f.person.trim() || !(amount > 0)) { err.value = t('amountRequired2'); return }
  busy.value = true
  try {
    const row = await save('debts', {
      ...(orig ? { id: orig.id } : {}), direction: f.direction, person: f.person.trim(), amount, currency: f.currency,
      date: f.date || todayISO(), due_date: f.due_date || null, note: f.note.trim() || null, member_id: f.member_id || null,
    })
    if (isNew && viaAccount.value) {
      await save('transactions', { kind: moveKind(f.direction, false), amount, account_id: viaAccount.value, member_id: f.member_id || null, date: f.date || todayISO(), merchant: f.person.trim(), note: t(f.direction === 'owed_to_us' ? 'owedToUs' : 'weOwe'), debt_id: row.id })
    }
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}

async function recordPayment(settleAll = false) {
  const left = Number(orig.amount) - Number(orig.paid)
  const amount = settleAll ? left : Math.min(left, parseAmount(pay.amount))
  if (!(amount > 0)) return
  busy.value = true
  try {
    if (pay.account_id) {
      await save('transactions', { kind: moveKind(orig.direction, true), amount, account_id: pay.account_id, member_id: me.value?.id || null, date: todayISO(), merchant: orig.person, note: t('debtRepaidNote'), debt_id: orig.id })
    }
    const paid = Math.round((Number(orig.paid) + amount) * 100) / 100
    await save('debts', { id: orig.id, paid, settled: paid >= Number(orig.amount) - 0.005 })
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}
// „Achitat”: tot restul, cu alegerea contului de pe care/pe care au trecut banii
function settle() { pay.open = true; pay.all = true; pay.amount = num(Number(orig.amount) - Number(orig.paid)) }
async function del() { if (await confirmDialog(t('delete') + '?')) { await remove('debts', orig.id); router.back() } }
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ isNew ? t('newDebt') : t('editDebt') }}</h1>
    <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
      <button type="button" :class="{ on: f.direction === 'owed_to_us' }" @click="f.direction = 'owed_to_us'">{{ t('owedToUs') }}</button>
      <button type="button" :class="{ on: f.direction === 'we_owe' }" @click="f.direction = 'we_owe'">{{ t('weOwe') }}</button>
    </div>
    <div class="fld"><label for="d-p">{{ t('debtPerson') }}</label><input id="d-p" v-model="f.person" class="inp" maxlength="40"></div>
    <div class="grid2">
      <div class="fld"><label for="d-a">{{ t('amount') }}</label><input id="d-a" v-model="f.amount" class="inp" inputmode="decimal"></div>
      <div class="fld"><label for="d-c">{{ t('currency') }}</label><select id="d-c" v-model="f.currency" class="inp"><option v-for="c in CURRENCIES" :key="c">{{ c }}</option></select></div>
    </div>
    <div class="grid2">
      <div class="fld"><label for="d-d">{{ t('date') }}</label><input id="d-d" v-model="f.date" type="date" class="inp"></div>
      <div class="fld"><label for="d-due">{{ t('debtDue') }}</label><input id="d-due" v-model="f.due_date" type="date" class="inp"></div>
    </div>
    <div class="fld"><label for="d-n">{{ t('note') }}</label><input id="d-n" v-model="f.note" class="inp" :placeholder="t('optional')" maxlength="200"></div>
    <div v-if="isNew" class="fld">
      <label for="d-acc">{{ t('debtWithTx') }}</label>
      <select id="d-acc" v-model="viaAccount" class="inp"><option value="">{{ t('notFromAccount') }}</option><option v-for="a in accs" :key="a.id" :value="a.id">{{ accLabel(a) }}</option></select>
    </div>

    <template v-if="!isNew && !orig.settled">
      <div class="bf-card stack">
        <div class="kv"><span class="muted">{{ t('debtPaid') }}</span><b>{{ money(orig.paid) }} / {{ money(orig.amount) }} {{ orig.currency }}</b></div>
        <div class="bf-bar"><i :style="{ width: Math.min(100, (orig.paid / orig.amount) * 100) + '%' }"></i></div>
        <template v-if="pay.open">
          <div v-if="!pay.all" class="fld"><label for="p-a">{{ t('debtPayAmount') }}</label><input id="p-a" v-model="pay.amount" class="inp" inputmode="decimal"></div>
          <div v-else class="kv"><span class="muted">{{ t('debtPayAmount') }}</span><b>{{ pay.amount }} {{ orig.currency }}</b></div>
          <div class="fld">
            <label for="p-acc">{{ orig.direction === 'we_owe' ? t('debtFromAcc') : t('debtToAcc') }}</label>
            <select id="p-acc" v-model="pay.account_id" class="inp"><option value="">{{ t('notFromAccount') }}</option><option v-for="a in activeAccounts.filter((x) => x.currency === orig.currency)" :key="a.id" :value="a.id">{{ accLabel(a) }}</option></select>
          </div>
          <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="recordPayment(pay.all)">{{ pay.all ? t('settled') : t('debtPartial') }}</button>
        </template>
        <div v-else class="grid2">
          <button type="button" class="bf-btn bf-btn--secondary" @click="pay.open = true">{{ t('debtPartial') }}</button>
          <button type="button" class="bf-btn bf-btn--secondary" :disabled="busy" @click="settle"><Icon name="check" />{{ t('settled') }}</button>
        </div>
      </div>
    </template>

    <div v-if="!isNew && missing > 0" class="bf-card stack" style="box-shadow: inset 0 0 0 1.5px var(--warning), var(--shadow-card);">
      <b>{{ t('debtMissingTitle', money(missing), orig.currency) }}</b>
      <span class="hint" style="margin: 0;">{{ orig.direction === 'we_owe' ? t('debtMissingWe') : t('debtMissingUs') }}</span>
      <select v-model="fix.account_id" class="inp" :aria-label="t('account')"><option value="">—</option><option v-for="a in activeAccounts.filter((x) => x.currency === orig.currency)" :key="a.id" :value="a.id">{{ accLabel(a) }}</option></select>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy || !fix.account_id" @click="addMissing">{{ t('debtMissingAdd') }}</button>
    </div>

    <div v-if="moves.length" class="stack">
      <h2 class="h-sec">{{ t('debtMoves') }}</h2>
      <div class="bf-list"><TxRow v-for="x in moves" :key="x.id" :tx="x" /></div>
      <p class="hint" style="margin: 0;">{{ t('debtMovesHint') }}</p>
    </div>

    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del"><Icon name="trash" />{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
