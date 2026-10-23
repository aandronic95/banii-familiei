<script setup>
// Calendarul cheltuielilor: zilele scumpe mai roșii, zilele fără cheltuieli verzi; atingi o zi și vezi ce s-a cumpărat
import { ref, computed } from 'vue'
import { S, dailySpend, monthRange } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, todayISO, monthName, dateLong } from '../lib/format.js'
import TxRow from './TxRow.vue'

const today = todayISO()
const cursor = ref(today.slice(0, 7)) // AAAA-LL
const sel = ref(null)
function shift(k) {
  const [y, m] = cursor.value.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + k, 1))
  cursor.value = d.toISOString().slice(0, 7)
  sel.value = null
}
const first = computed(() => S.transactions.reduce((mn, x) => (!mn || x.date < mn ? x.date : mn), null))
const canPrev = computed(() => first.value && cursor.value > first.value.slice(0, 7))
const canNext = computed(() => cursor.value < today.slice(0, 7))

const cal = computed(() => {
  const [a, b] = monthRange(cursor.value + '-01')
  const { days } = dailySpend(a, b)
  const vals = Object.entries(days).filter(([d, v]) => d <= today && v > 0).map(([, v]) => v).sort((x, y) => x - y)
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 0
  const cuts = [q(0.25), q(0.5), q(0.75), q(0.92)]
  const lead = (new Date(a).getUTCDay() + 6) % 7
  const cells = Array.from({ length: lead }, () => null)
  for (const [d, v] of Object.entries(days)) {
    const future = d > today || (first.value && d < first.value) // fără date încă
    const lvl = future ? -1 : v === 0 ? 0 : 1 + cuts.filter((c) => v > c).length
    cells.push({ d, v, n: Number(d.slice(8)), lvl, future, today: d === today })
  }
  const total = Object.values(days).reduce((s, v) => s + v, 0)
  const zero = cells.filter((c) => c && !c.future && c.v === 0).length
  return { cells, total, zero, label: `${monthName(Number(cursor.value.slice(5)) - 1)} ${cursor.value.slice(0, 4)}` }
})
const dayTx = computed(() => (sel.value ? S.transactions.filter((x) => x.date === sel.value).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')) : []))
</script>

<template>
  <section class="bf-card stack" aria-labelledby="sc-h">
    <div class="sec-head">
      <h2 id="sc-h" class="h-sec">{{ t('scTitle') }}</h2>
      <div style="display: flex; align-items: center; gap: 4px;">
        <button type="button" class="amt-op" style="width: 34px; height: 34px;" :disabled="!canPrev" :aria-label="t('prevMonth')" @click="shift(-1)">‹</button>
        <span class="cap" style="min-width: 92px; text-align: center; font-weight: 600;">{{ cal.label }}</span>
        <button type="button" class="amt-op" style="width: 34px; height: 34px;" :disabled="!canNext" :aria-label="t('nextMonth')" @click="shift(1)">›</button>
      </div>
    </div>
    <div class="hm">
      <span v-for="w in t('wdShort')" :key="w" class="hm__wd">{{ w }}</span>
      <template v-for="(c, i) in cal.cells" :key="i">
        <span v-if="!c"></span>
        <button v-else type="button" class="hm__d" :class="['hm--' + (c.lvl < 0 ? 'f' : c.lvl), { 'hm__d--today': c.today, 'hm__d--sel': sel === c.d }]"
                :disabled="c.future" :aria-label="`${dateLong(c.d)}: ${money0(c.v)} MDL`" @click="sel = sel === c.d ? null : c.d">
          <span>{{ c.n }}</span><small v-if="c.v">{{ c.v >= 1000 ? (c.v / 1000).toFixed(1).replace('.', ',') + 'k' : money0(c.v) }}</small>
        </button>
      </template>
    </div>
    <div class="hm__legend cap">
      <span><i class="hm--0"></i>{{ t('scZero') }}</span>
      <span><i class="hm--1"></i><i class="hm--3"></i><i class="hm--5"></i>{{ t('scMore') }}</span>
      <span style="margin-left: auto;">{{ t('scSummary', money0(cal.total), cal.zero) }}</span>
    </div>
    <template v-if="sel">
      <div class="sec-head"><h3 class="h-sec" style="font-size: 15px;">{{ dateLong(sel) }}</h3><span class="cap">{{ money0(cal.cells.find((c) => c && c.d === sel)?.v || 0) }} MDL</span></div>
      <div v-if="dayTx.length" class="bf-list"><TxRow v-for="x in dayTx" :key="x.id" :tx="x" /></div>
      <p v-else class="hint bf-income" style="margin: 0;">{{ t('scNoSpend') }}</p>
    </template>
  </section>
</template>
