<script setup>
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, me, save, remove, activeAccounts, balances, goalProgress } from '../store.js'
import { t } from '../lib/i18n.js'
import { parseAmount, todayISO, money } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.goals.find((g) => g.id === route.params.id)
if (!isNew && !orig) router.replace('/goals')
const num = (v) => (v === null || v === undefined ? '' : String(Number(v)).replace('.', ','))
const ICONS = ['piggy', 'home', 'car', 'ticket', 'school', 'heart', 'gift', 'shield', 'globe']
const f = reactive({
  name: orig?.name ?? '', target: num(orig?.target), currency: orig?.currency ?? 'MDL', account_id: orig?.account_id ?? '',
  saved: num(orig?.saved ?? 0), member_id: orig?.member_id ?? '', deadline: orig?.deadline ?? '', icon: orig?.icon ?? 'piggy', done: orig?.done ?? false,
})
const add = reactive({ open: false, amount: '', from: '' })
const err = ref('')
const busy = ref(false)
const accs = computed(() => activeAccounts.value.filter((a) => a.currency === f.currency))
const accLabel = (a) => `${a.name} · ${money(balances.value[a.id])} ${a.currency}`
const fromAccs = computed(() => activeAccounts.value.filter((a) => a.id !== orig?.account_id && a.currency === (orig?.currency || f.currency)))

async function submit() {
  err.value = ''
  const target = parseAmount(f.target)
  if (!f.name.trim() || !(target > 0)) { err.value = t('amountRequired2'); return }
  busy.value = true
  try {
    await save('goals', {
      ...(orig ? { id: orig.id } : {}), name: f.name.trim(), target, currency: f.currency, account_id: f.account_id || null,
      saved: f.account_id ? 0 : parseAmount(f.saved) || 0, member_id: f.member_id || null, deadline: f.deadline || null, icon: f.icon, done: !!f.done,
    })
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}

// „Pune bani”: transfer în contul obiectivului, sau doar crește suma strânsă
async function addMoney() {
  const amount = parseAmount(add.amount)
  if (!(amount > 0)) return
  busy.value = true
  try {
    if (orig.account_id && add.from) {
      await save('transactions', { kind: 'transfer', amount, account_id: add.from, to_account_id: orig.account_id, member_id: me.value?.id || null, date: todayISO(), note: orig.name })
    } else if (!orig.account_id) {
      await save('goals', { id: orig.id, saved: Math.round((Number(orig.saved) + amount) * 100) / 100 })
      if (add.from) await save('transactions', { kind: 'invest', amount, account_id: add.from, member_id: me.value?.id || null, date: todayISO(), merchant: orig.name, note: t('goalsTitle') })
    }
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}
async function del() { if (await confirmDialog(t('delete') + '?')) { await remove('goals', orig.id); router.back() } }
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ isNew ? t('newGoal') : t('editGoal') }}</h1>

    <div v-if="!isNew" class="bf-card stack">
      <div class="kv"><span class="muted">{{ t('goalSaved') }}</span><b>{{ money(goalProgress(orig).saved) }} / {{ money(orig.target) }} {{ orig.currency }}</b></div>
      <div class="bf-bar" style="height: 10px;"><i :style="{ width: goalProgress(orig).pct * 100 + '%' }"></i></div>
      <template v-if="add.open">
        <div class="fld"><label for="g-add">{{ t('goalAddAmount') }}</label><input id="g-add" v-model="add.amount" class="inp" inputmode="decimal"></div>
        <div class="fld">
          <label for="g-from">{{ t('goalFrom') }}</label>
          <select id="g-from" v-model="add.from" class="inp">
            <option v-if="!orig.account_id" value="">{{ t('notFromAccount') }}</option>
            <option v-for="a in fromAccs" :key="a.id" :value="a.id">{{ accLabel(a) }}</option>
          </select>
        </div>
        <button type="button" class="bf-btn bf-btn--primary" :disabled="busy || (orig.account_id && !add.from)" @click="addMoney"><Icon name="plus" />{{ t('goalAdd') }}</button>
      </template>
      <button v-else type="button" class="bf-btn bf-btn--primary" @click="add.open = true"><Icon name="plus" />{{ t('goalAdd') }}</button>
    </div>

    <div class="fld"><label for="g-n">{{ t('name') }}</label><input id="g-n" v-model="f.name" class="inp" maxlength="40" placeholder="Vacanță la mare"></div>
    <div class="grid2">
      <div class="fld"><label for="g-t">{{ t('goalTarget') }}</label><input id="g-t" v-model="f.target" class="inp" inputmode="decimal"></div>
      <div class="fld"><label for="g-c">{{ t('currency') }}</label><select id="g-c" v-model="f.currency" class="inp"><option>MDL</option><option>EUR</option><option>USD</option></select></div>
    </div>
    <div class="fld">
      <label for="g-acc">{{ t('goalAccount') }}</label>
      <select id="g-acc" v-model="f.account_id" class="inp"><option value="">{{ t('goalNoAccount') }}</option><option v-for="a in accs" :key="a.id" :value="a.id">{{ accLabel(a) }}</option></select>
      <span class="hint">{{ t('goalAccountHint') }}</span>
    </div>
    <div v-if="!f.account_id" class="fld"><label for="g-s">{{ t('goalSaved') }}</label><input id="g-s" v-model="f.saved" class="inp" inputmode="decimal"></div>
    <div class="grid2">
      <div class="fld"><label for="g-d">{{ t('goalDeadline') }}</label><input id="g-d" v-model="f.deadline" type="date" class="inp"></div>
      <div class="fld">
        <label for="g-m">{{ t('owner') }}</label>
        <select id="g-m" v-model="f.member_id" class="inp"><option value="">{{ t('common') }}</option><option v-for="m in S.members" :key="m.id" :value="m.id">{{ m.name }}</option></select>
      </div>
    </div>
    <div class="fld">
      <span class="lbl">{{ t('icon') }}</span>
      <div class="bf-chips">
        <button v-for="i in ICONS" :key="i" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.icon === i }" style="width: 44px; height: 44px; justify-content: center; padding: 0;" :aria-label="i" @click="f.icon = i"><Icon :name="i" /></button>
      </div>
    </div>
    <label v-if="!isNew" class="bf-row bf-list" for="g-done"><div class="bf-row__body"><div class="bf-row__title">{{ t('goalReached') }}</div></div><input id="g-done" v-model="f.done" type="checkbox" class="sw"></label>
    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del"><Icon name="trash" />{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
