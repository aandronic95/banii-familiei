<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, isOwner, totalMdl, debtMdl, investMdl, periodSums, monthRange, budgetRows, loanStatuses, nextSalary } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money, money0, monthName, daysUntil, dateShort } from '../lib/format.js'
import TxRow from '../components/TxRow.vue'
import BudgetBar from '../components/BudgetBar.vue'
import Icon from '../components/Icon.vue'
import { privacy, togglePrivacy } from '../lib/privacy.js'
import { haptic } from '../lib/telegram.js'

const router = useRouter()
const now = new Date()
const title = `${monthName(now.getMonth())} ${now.getFullYear()}`
const month = computed(() => { const [a, b] = monthRange(); return periodSums(a, b) })
const recent = computed(() => [...S.transactions].sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at)).slice(0, 6))
const budgets = computed(() => [...budgetRows.value].sort((a, b) => b.pct - a.pct).slice(0, 4))
const adults = computed(() => S.members.filter((m) => m.role !== 'none'))

// Ghid de pornire: dispare singur când totul e făcut, sau când îl închizi
const guideHidden = ref((() => { try { return localStorage.getItem('bf-guide-hidden') === '1' } catch (_) { return false } })())
const guide = computed(() => {
  const steps = [
    { key: 'acc', done: S.accounts.length > 1 || S.accounts.some((a) => Number(a.opening_balance) !== 0), title: t('gAccounts'), to: '/accounts' },
    { key: 'tx', done: S.transactions.length > 0, title: t('gTx'), to: '/tx/new' },
    { key: 'loan', done: S.loans.length > 0, title: t('gLoans'), to: '/credits' },
    { key: 'car', done: S.cars.length > 0, title: t('gCar'), to: '/car' },
  ]
  if (isOwner.value) steps.push({ key: 'inv', done: S.members.some((m) => m.role === 'editor'), title: t('gInvite'), to: '/family' })
  return { steps, done: steps.filter((x) => x.done).length }
})
const showGuide = computed(() => !guideHidden.value && guide.value.done < guide.value.steps.length)
function hideGuide() { guideHidden.value = true; try { localStorage.setItem('bf-guide-hidden', '1') } catch (_) {} }

// Adăugare rapidă: categoriile folosite cel mai des în ultimele 60 de zile
const quick = computed(() => {
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const count = {}
  for (const x of S.transactions) if (x.kind === 'expense' && x.category_id && x.date >= since) count[x.category_id] = (count[x.category_id] || 0) + 1
  return S.categories
    .filter((c) => c.kind === 'expense' && !c.archived && c.icon !== 'bank')
    .sort((a, b) => (count[b.id] || 0) - (count[a.id] || 0) || a.sort - b.sort)
    .slice(0, 4)
})

// Avertizări: rate în următoarele 5 zile și termene la mașină în 14 zile
const alerts = computed(() => {
  const out = []
  for (const l of S.loans) {
    if (l.closed) continue
    const n = loanStatuses.value[l.id]?.next
    if (!n) continue
    const d = daysUntil(n.due)
    if (d <= 5) out.push({ key: 'l' + l.id, danger: d < 0, text: `${l.name}: ${money0(n.payment)} ${l.currency}`, sub: d < 0 ? dateShort(n.due) : t('inDays', d), to: '/loan/' + l.id })
  }
  for (const i of S.investments) {
    if (i.status === 'closed' || !i.maturity_date) continue
    const d = daysUntil(i.maturity_date)
    if (d <= 7) out.push({ key: 'i' + i.id, danger: false, text: `${i.name}${i.code ? ' ' + i.code : ''}`, sub: d < 0 ? dateShort(i.maturity_date) : t('matures', t('inDays', d)), to: '/investment/' + i.id })
  }
  for (const e of S.carEvents) {
    if (e.done || !e.due_date) continue
    const d = daysUntil(e.due_date)
    if (d <= 14) out.push({ key: 'c' + e.id, danger: d < 0, text: e.title, sub: d < 0 ? dateShort(e.due_date) : t('inDays', d), to: '/car' })
  }
  return out
})
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <div>
        <div class="muted" style="font: 500 13px/18px var(--font-sans);">{{ t('hello') }}, {{ me?.name }}</div>
        <h1 class="h-title">{{ title }}</h1>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button type="button" class="eye-btn" :aria-label="privacy ? t('showAmounts') : t('hideAmounts')" :aria-pressed="privacy" @click="togglePrivacy(); haptic('light')"><Icon :name="privacy ? 'eyeOff' : 'eye'" /></button>
        <div style="display: flex;">
        <span v-for="(m, i) in adults" :key="m.id" class="av" :style="{ width: '32px', height: '32px', fontSize: '13px', marginLeft: i ? '-6px' : 0, boxShadow: `inset 0 0 0 2px var(--person-${m.color}), 0 0 0 2px var(--bg)` }">{{ m.name.slice(0, 1).toUpperCase() }}</span>
        </div>
      </div>
    </div>

    <button type="button" class="bf-card" style="border: 0; text-align: left; color: inherit; cursor: pointer;" @click="router.push('/accounts')">
      <div class="bf-balance__label">{{ t('availableAll') }}</div>
      <div class="bf-balance__amount">{{ money(totalMdl) }}<span class="bf-balance__cur">MDL</span></div>
      <div class="bf-balance__meta" style="flex-wrap: wrap;">
        <span>{{ t('month') }}: <b class="bf-income">+{{ money0(month.inc) }}</b></span>
        <span><b class="bf-expense">−{{ money0(month.exp) }}</b></span>
        <span v-if="investMdl > 0">{{ t('investments') }}: <b>{{ money0(investMdl) }}</b></span>
        <span v-if="debtMdl > 0">{{ t('debts') }}: <b>{{ money0(debtMdl) }}</b></span>
      </div>
    </button>

    <section v-if="showGuide" class="bf-card stack" aria-labelledby="guide-h">
      <div class="sec-head">
        <h2 id="guide-h" class="h-sec">{{ t('gTitle') }}</h2>
        <span class="cap">{{ t('gProgress', guide.done, guide.steps.length) }}</span>
      </div>
      <div class="bf-bar" style="margin-top: 0;"><i :style="{ width: (guide.done / guide.steps.length) * 100 + '%' }"></i></div>
      <div class="guide">
        <button v-for="st in guide.steps" :key="st.key" type="button" class="guide__step" :class="{ 'guide__step--done': st.done }" @click="router.push(st.to)">
          <span class="guide__mark" aria-hidden="true"><Icon v-if="st.done" name="tick" :size="14" /></span>
          <span class="guide__title">{{ st.title }}</span>
          <span v-if="!st.done" class="chev" aria-hidden="true">›</span>
        </button>
      </div>
      <button type="button" class="link" style="align-self: flex-start; padding: 0;" @click="hideGuide">{{ t('gHide') }}</button>
    </section>

    <section class="stack" :aria-label="t('quickAdd')">
      <div class="quick">
        <button v-for="c in quick" :key="c.id" type="button" class="quick__btn" @click="router.push({ path: '/tx/new', query: { category: c.id } })">
          <span class="bf-row__icon"><Icon :name="c.icon" /></span>
          <span class="quick__label">{{ catName(c) }}</span>
        </button>
      </div>
    </section>

    <button v-if="nextSalary" type="button" class="bf-banner" style="border: 0; text-align: left; cursor: pointer; background: var(--surface); box-shadow: var(--shadow-card);" @click="router.push('/calendar')">
      <Icon name="clock" />
      <div style="flex: 1;"><b>{{ t('untilSalary', t('inDays', Math.max(0, daysUntil(nextSalary.next_date)))) }}</b> · {{ t('calendarTitle').toLowerCase() }}</div>
      <span class="chev" aria-hidden="true">›</span>
    </button>

    <div v-if="alerts.length" class="stack">
      <button v-for="a in alerts" :key="a.key" type="button" class="bf-banner" :class="{ 'bf-banner--danger': a.danger }" style="border: 0; text-align: left; cursor: pointer;" @click="router.push(a.to)">
        <Icon name="alert" />
        <div><b>{{ a.text }}</b> · {{ a.sub }}</div>
      </button>
    </div>

    <section v-if="budgets.length" class="stack">
      <div class="sec-head"><h2 class="h-sec">{{ t('monthBudget') }}</h2><button class="link" @click="router.push('/budgets')">{{ t('all') }}</button></div>
      <div class="bf-card stack-lg">
        <BudgetBar v-for="r in budgets" :key="r.cat.id" :row="r" :show-note="r.state !== 'ok'" />
      </div>
    </section>

    <section class="stack">
      <div class="sec-head"><h2 class="h-sec">{{ t('recentTx') }}</h2><button class="link" @click="router.push('/transactions')">{{ t('all') }}</button></div>
      <div v-if="recent.length" class="bf-list">
        <TxRow v-for="x in recent" :key="x.id" :tx="x" />
      </div>
      <div v-else class="bf-card empty">{{ t('noTx') }}</div>
    </section>
  </main>
</template>
