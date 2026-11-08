<script setup>
// „A venit salariul”: cât merge pe plățile până la următorul salariu, cât pui deoparte și cât rămâne pe zi
import { ref, computed } from 'vue'
import { S, me, save, savePrefs, salaryToSplit, salarySplit, accountById, activeAccounts, txCurrency, toMdl, goalProgress } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, dateShort, todayISO } from '../lib/format.js'
import { haptic } from '../lib/telegram.js'
import { toast } from './Toast.js'

const tx = salaryToSplit
const prefs = computed(() => me.value?.prefs?.salary || {})
const pct = ref(prefs.value.pct ?? 10)
const dest = ref(prefs.value.dest || '') // 'acc:<id>' sau 'goal:<id>'
const plan = computed(() => (tx.value ? salarySplit(tx.value, pct.value) : null))
const open = ref(false)
const busy = ref(false)
const fromAcc = computed(() => (tx.value ? accountById(tx.value.account_id) : null))
const destOptions = computed(() => [
  ...activeAccounts.value.filter((a) => a.id !== tx.value?.account_id).map((a) => ({ v: 'acc:' + a.id, label: a.name + (a.currency !== 'MDL' ? ' · ' + a.currency : '') })),
  ...S.goals.filter((g) => !g.done).map((g) => ({ v: 'goal:' + g.id, label: '🎯 ' + g.name })),
])
function setPct(v) { pct.value = v; savePrefs({ salary: { ...prefs.value, pct: v, dest: dest.value } }).catch(() => {}) }
async function done(extra = {}) {
  const list = [tx.value.id, ...(me.value?.prefs?.salaryDone || [])].slice(0, 20)
  await savePrefs({ salaryDone: list, salary: { ...prefs.value, pct: pct.value, dest: dest.value }, ...extra })
}
// Mută partea de economii: transfer pe contul ales sau în obiectiv
async function moveSave() {
  if (!plan.value?.save || !dest.value) return
  busy.value = true
  try {
    const [kind, id] = dest.value.split(':')
    const fromCur = txCurrency(tx.value)
    const amountFrom = Math.round((plan.value.save / (S.rates[fromCur] ?? 1)) * 100) / 100
    const goal = kind === 'goal' ? S.goals.find((g) => g.id === id) : null
    const toId = kind === 'acc' ? id : goal?.account_id
    if (toId && toId !== tx.value.account_id) {
      const to = accountById(toId)
      const toAmount = Math.round((toMdl(amountFrom, fromCur) / (S.rates[to.currency] ?? 1)) * 100) / 100
      await save('transactions', { kind: 'transfer', amount: amountFrom, account_id: tx.value.account_id, to_account_id: toId, to_amount: to.currency !== fromCur ? toAmount : null,
        member_id: me.value?.id || null, date: todayISO(), merchant: t('salSaveNote'), note: t('salSaveNote') })
    }
    if (goal && !goal.account_id) await save('goals', { id: goal.id, saved: Math.round((Number(goal.saved) + plan.value.save / (S.rates[goal.currency] ?? 1)) * 100) / 100 })
    await done()
    haptic('success'); toast(t('salMoved', money0(plan.value.save)))
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = false }
}
</script>

<template>
  <section v-if="tx && plan" class="bf-card stack" aria-labelledby="sal-h">
    <div class="kv" style="align-items: baseline;">
      <h2 id="sal-h" class="h-sec">💼 {{ t('salTitle') }}</h2>
      <b class="bf-income">+{{ money0(plan.salary) }} MDL</b>
    </div>
    <div class="kv"><span>{{ t('salBills', dateShort(plan.until, true), plan.list.length) }}</span><b class="bf-expense">−{{ money0(plan.bills) }}</b></div>
    <button v-if="plan.list.length" type="button" class="link" style="padding: 0; justify-self: start;" @click="open = !open">{{ open ? t('salHide') : t('salShow') }}</button>
    <div v-if="open" class="stack" style="gap: 4px;">
      <div v-for="(o, i) in plan.list" :key="i" class="kv cap"><span>{{ dateShort(o.date) }} · {{ o.name }}</span><span>{{ money0(o.amount) }}</span></div>
    </div>
    <div class="kv"><span>{{ t('salSave', pct) }}</span><b>{{ money0(plan.save) }}</b></div>
    <div class="bf-chips">
      <button v-for="v in [0, 5, 10, 15, 20]" :key="v" type="button" class="bf-chip" :class="{ 'bf-chip--on': pct === v }" @click="setPct(v)">{{ v }}%</button>
    </div>
    <div class="kv" style="border-top: 1px solid var(--line); padding-top: 8px;"><b>{{ t('salRest') }}</b><b :class="plan.rest < 0 ? 'bf-expense' : ''">{{ money0(plan.rest) }}</b></div>
    <p v-if="plan.rest > 0" style="margin: 0; font-weight: 600; color: var(--brand);">{{ t('salPerDay', money0(plan.perDay), plan.days) }}</p>
    <p v-else class="hint" style="margin: 0; color: var(--danger);">{{ t('salShort', money0(plan.short)) }}</p>
    <template v-if="plan.save > 0">
      <select v-model="dest" class="inp" :aria-label="t('salDest')">
        <option value="">{{ t('salDest') }}</option>
        <option v-for="o in destOptions" :key="o.v" :value="o.v">{{ o.label }}</option>
      </select>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy || !dest" @click="moveSave">{{ t('salMove', money0(plan.save)) }}</button>
    </template>
    <button type="button" class="link" style="padding: 0; justify-self: start;" @click="done()">{{ t('salDone') }}</button>
    <p v-if="fromAcc" class="hint" style="margin: 0;">{{ t('salHint', fromAcc.name) }}</p>
  </section>
</template>
