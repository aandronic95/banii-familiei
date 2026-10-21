<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, save, loanStatuses, debtMdl, toMdl, activeAccounts, me } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, dateLong, daysUntil, todayISO } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const open = ref({})
const busy = ref(false)
const loans = computed(() => [...S.loans].sort((a, b) => Number(a.closed) - Number(b.closed)))
const monthly = computed(() => S.loans.filter((l) => !l.closed).reduce((s, l) => s + toMdl(loanStatuses.value[l.id]?.next?.payment || 0, l.currency), 0))
const pct = (x) => Math.round(x * 100)

function chip(l) {
  const n = loanStatuses.value[l.id]?.next
  if (!n || l.closed) return { text: t('closed'), cls: '' }
  const d = daysUntil(n.due)
  if (d < 0) return { text: dateLong(n.due), cls: 'danger' }
  if (d <= 5) return { text: t('inDays', d), cls: 'warn' }
  return { text: dateLong(n.due).replace(/ \d{4}$/, ''), cls: '' }
}
function rows(l) {
  const st = loanStatuses.value[l.id]
  if (open.value[l.id]) return st.schedule
  const i = st.next ? st.next.n - 1 : st.schedule.length
  return st.schedule.slice(Math.max(0, i), i + 3)
}

async function pay(l) {
  const st = loanStatuses.value[l.id]
  const n = st.next
  if (!n || busy.value) return
  if (!(await confirmDialog(t('payConfirm', money0(n.payment), l.currency)))) return
  busy.value = true
  try {
    const acc = activeAccounts.value.find((a) => a.id === l.account_id) || activeAccounts.value.find((a) => a.currency === l.currency)
    const cat = S.categories.find((c) => c.kind === 'expense' && c.icon === 'bank')
    let txId = null
    if (acc) {
      const tx = await save('transactions', {
        kind: 'expense', amount: n.payment, account_id: acc.id, category_id: cat?.id || null, member_id: me.value?.id || null,
        date: todayISO(), merchant: l.name, note: `#${n.n}`, loan_id: l.id,
      })
      txId = tx.id
    }
    await save('loan_payments', { loan_id: l.id, n: n.n, amount: n.payment, paid_at: todayISO(), transaction_id: txId })
    haptic('success'); toast(t('loanPaid'))
  } catch (e) { console.error(e); toast(t('error')) } finally { busy.value = false }
}
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('credits') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/loan/new')"><Icon name="plus" />{{ t('add') }}</button>
    </div>

    <div class="bf-card">
      <div class="bf-balance__label">{{ t('remaining') }}</div>
      <div class="bf-balance__amount">{{ money0(debtMdl) }}<span class="bf-balance__cur">MDL</span></div>
      <div class="bf-balance__meta"><span>{{ t('monthlyRates') }}: <b>{{ money0(monthly) }} MDL</b></span></div>
    </div>

    <div v-if="!S.loans.length" class="bf-card empty">{{ t('noLoans') }}</div>

    <section v-for="l in loans" :key="l.id" class="bf-card stack" :style="{ opacity: l.closed ? 0.7 : 1 }">
      <div class="sec-head" style="align-items: flex-start;">
        <button type="button" style="all: unset; cursor: pointer;" @click="router.push('/loan/' + l.id)">
          <h2 class="h-sec">{{ l.name }}</h2>
          <div class="cap">{{ [l.bank, String(l.annual_rate).replace('.', ',') + '% ' + t('perYear'), t('until') + ' ' + loanStatuses[l.id].schedule.at(-1)?.due.slice(0, 4)].filter(Boolean).join(' · ') }}</div>
        </button>
        <span class="bf-chip" :style="chip(l).cls === 'warn' ? 'background: var(--warning-soft); color: var(--warning);' : chip(l).cls === 'danger' ? 'background: var(--danger-soft); color: var(--danger);' : ''">{{ chip(l).text }}</span>
      </div>
      <div class="kv"><span class="muted">{{ t('balanceLeft') }}</span><b>{{ money0(loanStatuses[l.id].remaining) }} {{ l.currency }}</b></div>
      <div>
        <div class="bf-bar"><i :style="{ width: pct(loanStatuses[l.id].progress) + '%' }"></i></div>
        <div class="bf-budget__note">{{ t('paidOf', pct(loanStatuses[l.id].progress), money0(l.principal) + ' ' + l.currency) }} · {{ t('ratesOf', loanStatuses[l.id].paidCount, loanStatuses[l.id].total) }}</div>
      </div>
      <table v-if="!l.closed" class="sched">
        <thead><tr><th>{{ t('due') }}</th><th>{{ t('payment') }}</th><th>{{ t('interestShort') }}</th><th>{{ t('principalShort') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in rows(l)" :key="r.n" :class="{ paid: loanStatuses[l.id].paid.has(r.n) }">
            <td>{{ dateLong(r.due) }}</td><td>{{ money0(r.payment) }}</td><td>{{ money0(r.interest) }}</td><td>{{ money0(r.principal) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!l.closed" class="grid2">
        <button type="button" class="bf-btn bf-btn--primary" :disabled="busy || !loanStatuses[l.id].next" @click="pay(l)">{{ t('markPaid') }}</button>
        <button type="button" class="bf-btn bf-btn--secondary" @click="open[l.id] = !open[l.id]">{{ t('fullSchedule') }}</button>
      </div>
    </section>
  </main>
</template>
