<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, me, save, remove, activeAccounts } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { parseAmount, todayISO } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.recurring.find((r) => r.id === route.params.id)
if (!isNew && !orig) router.replace('/recurring')

// Prima dată potrivită pentru o zi din lună, de azi încolo
function firstDate(dom) {
  const today = todayISO()
  const [y, m] = today.split('-').map(Number)
  for (let k = 0; k < 2; k++) {
    const last = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate()
    const d = new Date(Date.UTC(y, m - 1 + k, Math.min(dom, last))).toISOString().slice(0, 10)
    if (d >= today) return d
  }
  return today
}

// Precompletare din „Abonamente găsite” (Rapoarte)
const qp = isNew ? route.query : {}
const f = reactive({
  kind: orig?.kind ?? 'expense',
  name: orig?.name ?? String(qp.name || ''),
  amount: orig ? String(Number(orig.amount)).replace('.', ',') : qp.amount ? String(qp.amount).replace('.', ',') : '',
  account_id: orig?.account_id ?? (qp.account && activeAccounts.value.some((a) => a.id === qp.account) ? qp.account : null) ?? activeAccounts.value.find((a) => a.type === 'card')?.id ?? activeAccounts.value[0]?.id ?? '',
  category_id: orig?.category_id ?? String(qp.category || ''),
  member_id: orig?.member_id ?? me.value?.id ?? '',
  every_months: orig?.every_months ?? 1,
  day_of_month: orig?.day_of_month ?? (Number(qp.day) || Number(todayISO().slice(8, 10))),
  next_date: orig?.next_date ?? '',
  auto_add: orig?.auto_add ?? true,
  remind: orig?.remind ?? true,
  active: orig?.active ?? true,
})
if (!f.next_date) f.next_date = firstDate(f.day_of_month)
watch(() => f.day_of_month, (d) => { const n = Math.min(31, Math.max(1, Number(d) || 1)); if (isNew) f.next_date = firstDate(n) })
const cats = computed(() => S.categories.filter((c) => c.kind === f.kind && !c.archived))
const err = ref('')
const busy = ref(false)

async function submit() {
  err.value = ''
  const amount = parseAmount(f.amount)
  if (!f.name.trim() || !(amount > 0)) { err.value = t('amountRequired2'); return }
  busy.value = true
  try {
    await save('recurring', {
      ...(orig ? { id: orig.id } : {}),
      kind: f.kind, name: f.name.trim(), amount, account_id: f.account_id || null, category_id: f.category_id || null,
      member_id: f.member_id || null, every_months: Number(f.every_months), day_of_month: Math.min(31, Math.max(1, Number(f.day_of_month) || 1)),
      next_date: f.next_date || firstDate(f.day_of_month), auto_add: !!f.auto_add, remind: !!f.remind, active: !!f.active,
    })
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}
async function del() {
  if (!(await confirmDialog(t('delete') + '?'))) return
  await remove('recurring', orig.id); router.back()
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ isNew ? t('newRecurring') : t('editRecurring') }}</h1>
    <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
      <button type="button" :class="{ on: f.kind === 'expense' }" @click="f.kind = 'expense'; f.category_id = ''">{{ t('expense') }}</button>
      <button type="button" :class="{ on: f.kind === 'income' }" @click="f.kind = 'income'; f.category_id = ''">{{ t('income') }}</button>
    </div>
    <div class="fld"><label for="r-n">{{ t('name') }}</label><input id="r-n" v-model="f.name" class="inp" maxlength="40" :placeholder="f.kind === 'income' ? 'Salariu' : 'Internet'"></div>
    <div class="grid2">
      <div class="fld"><label for="r-a">{{ t('amount') }}</label><input id="r-a" v-model="f.amount" class="inp" inputmode="decimal"></div>
      <div class="fld">
        <label for="r-e">{{ t('everyMonths') }}</label>
        <select id="r-e" v-model.number="f.every_months" class="inp">
          <option :value="1">{{ t('every1') }}</option><option :value="3">{{ t('every3') }}</option><option :value="6">{{ t('every6') }}</option><option :value="12">{{ t('every12') }}</option>
        </select>
      </div>
    </div>
    <div class="grid2">
      <div class="fld"><label for="r-d">{{ t('dayOfMonth') }}</label><input id="r-d" v-model.number="f.day_of_month" class="inp" inputmode="numeric" type="number" min="1" max="31"></div>
      <div class="fld"><label for="r-nx">{{ t('nextDate') }}</label><input id="r-nx" v-model="f.next_date" type="date" class="inp"></div>
    </div>
    <div class="fld">
      <label for="r-acc">{{ f.kind === 'income' ? t('toAccount') : t('fromAccount') }}</label>
      <select id="r-acc" v-model="f.account_id" class="inp"><option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ a.name }} · {{ a.currency }}</option></select>
    </div>
    <div class="fld">
      <span class="lbl">{{ t('category') }}</span>
      <div class="bf-chips">
        <button v-for="c in cats" :key="c.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.category_id === c.id }" @click="f.category_id = f.category_id === c.id ? '' : c.id"><Icon :name="c.icon" :size="16" />{{ catName(c) }}</button>
      </div>
    </div>
    <div class="fld">
      <span class="lbl">{{ t('who') }}</span>
      <div class="bf-chips">
        <button v-for="m in S.members" :key="m.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.member_id === m.id }" @click="f.member_id = m.id"><span :class="`bf-dot bf-p${m.color}`"></span>{{ m.name }}</button>
      </div>
    </div>
    <div class="bf-list">
      <label class="bf-row" for="r-auto"><div class="bf-row__body"><div class="bf-row__title">{{ t('autoAdd') }}</div><div class="bf-row__sub">{{ t('autoAddSub') }}</div></div><input id="r-auto" v-model="f.auto_add" type="checkbox" class="sw"></label>
      <label class="bf-row" for="r-rem"><div class="bf-row__body"><div class="bf-row__title">{{ t('remindDay') }}</div><div class="bf-row__sub">{{ t('remindSub') }}</div></div><input id="r-rem" v-model="f.remind" type="checkbox" class="sw"></label>
      <label v-if="!isNew" class="bf-row" for="r-act"><div class="bf-row__body"><div class="bf-row__title">{{ t('stActive') }}</div></div><input id="r-act" v-model="f.active" type="checkbox" class="sw"></label>
    </div>
    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del"><Icon name="trash" />{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
