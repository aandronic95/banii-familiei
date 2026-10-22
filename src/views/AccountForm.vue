<script setup>
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, save, remove, balances, accountById } from '../store.js'
import { t } from '../lib/i18n.js'
import { parseAmount, money } from '../lib/format.js'
import { confirmDialog, alertDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : accountById(route.params.id)
const f = reactive({
  name: orig?.name ?? '',
  type: orig?.type ?? (route.query.type || 'card'),
  currency: orig?.currency ?? 'MDL',
  member_id: orig?.member_id ?? '',
  bank: orig?.bank ?? '',
  last4: orig?.last4 ?? '',
  current: orig ? String(Math.round((balances.value[orig.id] ?? 0) * 100) / 100).replace('.', ',') : '',
  interest_rate: orig?.interest_rate ?? '',
  maturity_date: orig?.maturity_date ?? '',
  archived: orig?.archived ?? false,
  wallet_alias: orig?.wallet_alias ?? '',
})
const busy = ref(false)
const err = ref('')
const hasTx = computed(() => orig && S.transactions.some((x) => x.account_id === orig.id || x.to_account_id === orig.id))

async function submit() {
  err.value = ''
  if (!f.name.trim()) { err.value = t('name'); return }
  busy.value = true
  try {
    const desired = parseAmount(f.current)
    const opening = orig ? Math.round((desired - (balances.value[orig.id] - Number(orig.opening_balance))) * 100) / 100 : desired
    await save('accounts', {
      ...(orig ? { id: orig.id } : { sort: S.accounts.length + 1 }),
      name: f.name.trim(), type: f.type, currency: f.currency, member_id: f.member_id || null,
      bank: f.bank.trim() || null, last4: f.last4.replace(/\D/g, '').slice(-4) || null, opening_balance: opening,
      interest_rate: f.type === 'deposit' && f.interest_rate !== '' ? parseAmount(f.interest_rate) : null,
      maturity_date: f.type === 'deposit' && f.maturity_date ? f.maturity_date : null,
      archived: f.archived,
      wallet_alias: f.type === 'card' ? f.wallet_alias.trim() || null : null,
    })
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}

async function del() {
  if (hasTx.value) { alertDialog(t('cantDeleteAccount')); return }
  if (!(await confirmDialog(t('deleteAccountQ')))) return
  try { await remove('accounts', orig.id); router.back() } catch (e) { alertDialog(t('cantDeleteAccount')) }
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ isNew ? t('newAccount') : t('editAccount') }}</h1>

    <div class="seg" style="grid-template-columns: repeat(4, minmax(0, 1fr));" role="group" :aria-label="t('type')">
      <button v-for="k in ['card', 'cash', 'deposit', 'invest']" :key="k" type="button" :class="{ on: f.type === k }" @click="f.type = k">{{ t(k === 'card' ? 'cards' : k === 'cash' ? 'cash' : k === 'deposit' ? 'deposits' : 'invAccount').split(' ')[0] }}</button>
    </div>
    <p v-if="f.type === 'invest'" class="hint" style="margin: 0;">{{ t('invAccHint') }}</p>

    <div class="fld"><label for="a-name">{{ t('name') }}</label><input id="a-name" v-model="f.name" class="inp" maxlength="40"></div>

    <div class="fld">
      <span class="lbl">{{ t('currency') }}</span>
      <div class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
        <button v-for="c in ['MDL', 'EUR', 'USD']" :key="c" type="button" :class="{ on: f.currency === c }" @click="f.currency = c">{{ c }}</button>
      </div>
    </div>

    <div class="fld"><label for="a-bal">{{ t('openingBalance') }}, {{ f.currency }}</label><input id="a-bal" v-model="f.current" class="inp" inputmode="decimal" placeholder="0,00"></div>

    <div class="fld">
      <label for="a-mem">{{ t('owner') }}</label>
      <select id="a-mem" v-model="f.member_id" class="inp">
        <option value="">{{ t('common') }}</option>
        <option v-for="m in S.members" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </div>

    <div v-if="f.type !== 'cash'" class="grid2">
      <div class="fld"><label for="a-bank">{{ t('bank') }}</label><input id="a-bank" v-model="f.bank" class="inp" maxlength="30"></div>
      <div v-if="f.type === 'card'" class="fld"><label for="a-l4">{{ t('last4') }}</label><input id="a-l4" v-model="f.last4" class="inp" inputmode="numeric" maxlength="4"></div>
      <div v-else class="fld"><label for="a-int">{{ t('interest') }}</label><input id="a-int" v-model="f.interest_rate" class="inp" inputmode="decimal"></div>
    </div>
    <div v-if="f.type === 'card'" class="fld">
      <label for="a-wa">{{ t('walletAlias') }}</label>
      <input id="a-wa" v-model="f.wallet_alias" class="inp" maxlength="60" :placeholder="t('optional')">
      <span class="hint">{{ t('walletAliasHint') }}</span>
    </div>
    <div v-if="f.type === 'deposit'" class="fld"><label for="a-mat">{{ t('maturity') }}</label><input id="a-mat" v-model="f.maturity_date" type="date" class="inp"></div>

    <label v-if="!isNew" class="bf-row bf-list" for="a-arch">
      <div class="bf-row__body"><div class="bf-row__title">{{ t('archive') }}</div></div>
      <input id="a-arch" v-model="f.archived" type="checkbox" class="sw">
    </label>
    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del">{{ t('delete') }}</button>
    <p v-if="err" class="err">{{ err }}</p>

    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
