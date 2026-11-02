<script setup>
// Planificator de vacanță: buget pe categorii, cheltuieli în valută, total, pe zi și pe persoană.
// Cheltuielile se leagă prin etichetă; în zilele călătoriei eticheta se pune singură.
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, save, remove, tripStatsOf, categoryById, normTag, tripTxs, txCurrency } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money0, money, parseAmount, dateShort, todayISO } from '../lib/format.js'
import { haptic, confirmDialog } from '../lib/telegram.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const today = todayISO()
const list = computed(() => [...S.trips].sort((a, b) => b.start_date.localeCompare(a.start_date)).map((tr) => ({ tr, st: tripStatsOf(tr, today) })))
const openId = ref(null)
const cur = computed(() => list.value.find((x) => x.tr.id === openId.value) || null)
const expCats = computed(() => S.categories.filter((c) => c.kind === 'expense' && !c.archived))

const edit = ref(null)
function openEdit(tr) {
  edit.value = tr
    ? { id: tr.id, name: tr.name, tag: tr.tag, start_date: tr.start_date, end_date: tr.end_date, currency: tr.currency, budget: tr.budget != null ? String(Number(tr.budget)) : '', people: tr.people, auto_tag: tr.auto_tag, note: tr.note || '',
        plan: (tr.plan || []).map((p) => ({ category_id: p.category_id || '', amount: String(p.amount ?? '') })) }
    : { name: '', tag: '', start_date: '', end_date: '', currency: 'EUR', budget: '', people: S.members.length || 1, auto_tag: true, note: '', plan: [] }
}
const planSum = computed(() => (edit.value?.plan || []).reduce((s, p) => s + (parseAmount(p.amount) || 0), 0))
const tagOf = (e) => normTag(e.tag || e.name)
const err = ref('')
async function saveTrip() {
  const e = edit.value
  err.value = ''
  if (!e.name.trim() || !e.start_date || !e.end_date) { err.value = t('tripNeed'); return }
  if (e.end_date < e.start_date) { err.value = t('tripDates'); return }
  const tag = tagOf(e)
  if (!tag) { err.value = t('tripNeed'); return }
  if (S.trips.some((x) => x.tag === tag && x.id !== e.id)) { err.value = t('tripTagUsed', tag); return }
  const plan = e.plan.filter((p) => p.category_id && parseAmount(p.amount) > 0).map((p) => ({ category_id: p.category_id, amount: parseAmount(p.amount) }))
  const budget = parseAmount(e.budget) > 0 ? parseAmount(e.budget) : plan.length ? plan.reduce((s, p) => s + p.amount, 0) : null
  const row = await save('trips', { ...(e.id ? { id: e.id } : {}), name: e.name.trim().slice(0, 60), tag, start_date: e.start_date, end_date: e.end_date, currency: e.currency,
    budget, plan, people: Math.min(20, Math.max(1, Number(e.people) || 1)), auto_tag: !!e.auto_tag, note: e.note.trim() || null })
  edit.value = null
  openId.value = row.id
  haptic('success')
}
async function del() {
  if (!(await confirmDialog(t('tripDeleteQ')))) return
  await remove('trips', edit.value.id)
  edit.value = null; openId.value = null
}
const daysTo = (tr) => Math.round((Date.parse(tr.start_date) - Date.parse(today)) / 86400000)
const statusLabel = (st) => (st.status === 'before' ? t('tripBefore', daysTo(cur.value.tr)) : st.status === 'during' ? t('tripDuring', st.elapsed, st.days) : t('tripAfter'))
const txs = computed(() => (cur.value ? tripTxs(cur.value.tr).sort((a, b) => b.date.localeCompare(a.date)) : []))
const pct = (v) => Math.round(v * 100)
function addExpense() {
  const tr = cur.value.tr
  const d = today >= tr.start_date && today <= tr.end_date ? today : tr.start_date
  router.push({ path: '/tx/new', query: { tag: tr.tag, ...(d !== today ? { date: d } : {}) } })
}
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('tripTitle') }}</h1>
      <button v-if="!edit" type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="openEdit(null)"><Icon name="plus" />{{ t('add') }}</button>
    </div>

    <div v-if="edit" class="bf-card stack">
      <div class="fld"><label for="tr-n">{{ t('tripName') }}</label><input id="tr-n" v-model="edit.name" class="inp" maxlength="60" :placeholder="t('tripNamePh')"></div>
      <div class="grid2">
        <div class="fld"><label for="tr-s">{{ t('tripFrom') }}</label><input id="tr-s" v-model="edit.start_date" type="date" class="inp"></div>
        <div class="fld"><label for="tr-e">{{ t('tripTo') }}</label><input id="tr-e" v-model="edit.end_date" type="date" class="inp" :min="edit.start_date"></div>
      </div>
      <div class="grid2">
        <div class="fld"><span class="lbl">{{ t('currency') }}</span>
          <div class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr));"><button v-for="c in ['EUR', 'USD', 'MDL']" :key="c" type="button" :class="{ on: edit.currency === c }" @click="edit.currency = c">{{ c }}</button></div></div>
        <div class="fld"><label for="tr-p">{{ t('tripPeople') }}</label><input id="tr-p" v-model.number="edit.people" type="number" min="1" max="20" class="inp"></div>
      </div>
      <div class="fld"><label for="tr-b">{{ t('tripBudget') }}, {{ edit.currency }}</label><input id="tr-b" v-model="edit.budget" class="inp" inputmode="decimal" :placeholder="planSum ? money0(planSum) : t('tripBudgetPh')"></div>

      <div class="fld">
        <span class="lbl">{{ t('tripPlan') }}</span>
        <div v-for="(p, i) in edit.plan" :key="i" style="display: grid; grid-template-columns: 1fr 96px 36px; gap: 6px;">
          <select v-model="p.category_id" class="inp" :aria-label="t('category')"><option value="">—</option><option v-for="c in expCats" :key="c.id" :value="c.id">{{ catName(c) }}</option></select>
          <input v-model="p.amount" class="inp" inputmode="decimal" placeholder="0" :aria-label="t('amount')">
          <button type="button" class="link" :aria-label="t('delete')" @click="edit.plan.splice(i, 1)">×</button>
        </div>
        <button v-if="edit.plan.length < 20" type="button" class="link" style="padding: 0; justify-self: start;" @click="edit.plan.push({ category_id: '', amount: '' })">+ {{ t('tripPlanAdd') }}</button>
        <p v-if="planSum" class="hint" style="margin: 0;">{{ t('tripPlanSum', money0(planSum), edit.currency) }}</p>
      </div>

      <div class="fld"><label for="tr-t">{{ t('tripTag') }}</label><input id="tr-t" v-model="edit.tag" class="inp" maxlength="24" :placeholder="'#' + (tagOf({ name: edit.name }) || 'vacanta')"></div>
      <label class="kv" style="cursor: pointer;"><span>{{ t('tripAuto') }}</span><input v-model="edit.auto_tag" type="checkbox" style="width: 22px; height: 22px;"></label>
      <p v-if="err" class="err" style="margin: 0;">{{ err }}</p>
      <div style="display: flex; gap: 8px;">
        <button v-if="edit.id" type="button" class="bf-btn bf-btn--secondary" style="color: var(--danger);" @click="del">{{ t('delete') }}</button>
        <button type="button" class="bf-btn bf-btn--secondary" @click="edit = null">{{ t('cancel') }}</button>
        <button type="button" class="bf-btn bf-btn--primary" style="flex: 1;" @click="saveTrip">{{ t('save') }}</button>
      </div>
    </div>

    <template v-else-if="cur">
      <button type="button" class="link" style="padding: 0; justify-self: start;" @click="openId = null">← {{ t('tripAll') }}</button>
      <div class="bf-card stack">
        <div class="kv" style="align-items: flex-start;">
          <div>
            <div style="font-weight: 700; font-size: 18px;">{{ cur.tr.name }}</div>
            <div class="cap">{{ dateShort(cur.tr.start_date) }} – {{ dateShort(cur.tr.end_date, true) }} · #{{ cur.tr.tag }} · {{ statusLabel(cur.st) }}</div>
          </div>
          <button type="button" class="link" style="padding: 0;" @click="openEdit(cur.tr)">{{ t('edit') }}</button>
        </div>
        <div class="bf-balance__amount" style="font-size: 30px;">{{ money0(cur.st.net) }}<span class="bf-balance__cur">{{ cur.tr.currency }}</span></div>
        <template v-if="cur.st.budget">
          <div class="bf-bar" :class="{ 'bf-bar--warn': cur.st.pct > 0.85 && cur.st.pct <= 1, 'bf-bar--over': cur.st.pct > 1 }" style="margin-top: 0;"><i :style="{ width: Math.min(100, pct(cur.st.pct)) + '%' }"></i></div>
          <div class="cap">{{ cur.st.left >= 0 ? t('tripLeft', money0(cur.st.left), cur.tr.currency, money0(cur.st.budget)) : t('tripOver', money0(-cur.st.left), cur.tr.currency) }}</div>
        </template>
        <div class="grid2" style="gap: 10px;">
          <div><div class="cap">{{ t('tripPerDay') }}</div><b>{{ money0(cur.st.perDay) }} {{ cur.tr.currency }}</b></div>
          <div><div class="cap">{{ t('tripPerPerson', cur.tr.people) }}</div><b>{{ money0(cur.st.perPerson) }} {{ cur.tr.currency }}</b></div>
          <div v-if="cur.st.allowPerDay != null && cur.st.status !== 'after'"><div class="cap">{{ t('tripAllow') }}</div><b :style="{ color: cur.st.allowPerDay < 0 ? 'var(--danger)' : '' }">{{ money0(cur.st.allowPerDay) }} {{ cur.tr.currency }}</b></div>
          <div><div class="cap">{{ t('tripDays') }}</div><b>{{ cur.st.days }}</b></div>
        </div>
        <div v-if="Object.keys(cur.st.byCur).length" class="cap">{{ t('tripPaidIn') }}: {{ Object.entries(cur.st.byCur).map(([c, v]) => money0(v) + ' ' + c).join(' · ') }}</div>
        <button type="button" class="bf-btn bf-btn--primary" @click="addExpense"><Icon name="plus" />{{ t('tripAddExp') }}</button>
      </div>

      <div v-if="cur.st.rows.length" class="bf-card stack">
        <h2 class="h-sec">{{ t('tripByCat') }}</h2>
        <div v-for="r in cur.st.rows" :key="r.category_id || '-'" style="display: grid; gap: 4px;">
          <div class="bf-budget__top"><span class="bf-budget__name" style="font-size: 14px;">{{ r.category_id ? catName(categoryById(r.category_id)) : t('noCategory') }}</span>
            <span class="bf-budget__nums">{{ money0(r.spent) }}<template v-if="r.amount"> / {{ money0(r.amount) }}</template> {{ cur.tr.currency }}</span></div>
          <div v-if="r.amount" class="bf-bar" :class="{ 'bf-bar--over': r.spent > r.amount }" style="height: 6px; margin-top: 0;"><i :style="{ width: Math.min(100, (r.spent / r.amount) * 100) + '%' }"></i></div>
        </div>
      </div>

      <div class="bf-card stack">
        <h2 class="h-sec">{{ t('tripTxs', txs.length) }}</h2>
        <p v-if="!txs.length" class="hint" style="margin: 0;">{{ t('tripNoTx', cur.tr.tag) }}</p>
        <button v-for="x in txs.slice(0, 50)" :key="x.id" type="button" class="kv" style="all: unset; cursor: pointer; display: flex; justify-content: space-between; gap: 8px;" @click="router.push('/tx/' + x.id)">
          <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ dateShort(x.date) }} · {{ x.merchant || catName(categoryById(x.category_id)) || '—' }}</span>
          <b :class="x.kind === 'income' ? 'bf-income' : ''" style="white-space: nowrap;">{{ x.kind === 'income' ? '+' : '−' }}{{ money(x.amount) }} {{ txCurrency(x) }}</b>
        </button>
        <button v-if="txs.length" type="button" class="link" style="padding: 0; justify-self: start;" @click="router.push({ path: '/transactions', query: { tag: cur.tr.tag } })">{{ t('tripAllTx') }}</button>
      </div>
    </template>

    <template v-else>
      <div v-if="!list.length" class="bf-card empty">{{ t('tripEmpty') }}</div>
      <div v-for="x in list" :key="x.tr.id" class="bf-card stack" role="button" tabindex="0" style="cursor: pointer; padding: 14px 16px;" @click="openId = x.tr.id" @keydown.enter="openId = x.tr.id">
        <div class="kv"><b>{{ x.tr.name }}</b><b style="white-space: nowrap;">{{ money0(x.st.net) }}<template v-if="x.st.budget"> / {{ money0(x.st.budget) }}</template> {{ x.tr.currency }}</b></div>
        <div class="cap">{{ dateShort(x.tr.start_date) }} – {{ dateShort(x.tr.end_date, true) }} · {{ x.st.status === 'before' ? t('tripBefore', daysTo(x.tr)) : x.st.status === 'during' ? t('tripDuring', x.st.elapsed, x.st.days) : t('tripAfter') }}</div>
        <div v-if="x.st.budget" class="bf-bar" :class="{ 'bf-bar--over': x.st.pct > 1 }" style="margin-top: 0;"><i :style="{ width: Math.min(100, pct(x.st.pct)) + '%' }"></i></div>
      </div>
      <p class="hint">{{ t('tripHint') }}</p>
    </template>
  </main>
</template>
