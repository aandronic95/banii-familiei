<script setup>
// Cheltuieli pe zi pentru ultimele 1, 3, 6 sau 12 luni
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { dailySpend, monthsBack, firstTxDate, categoryById, monthRange } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money, money0, todayISO, dateShort, monthShort } from '../lib/format.js'

const router = useRouter()
const n = ref((() => { try { return Number(localStorage.getItem('bf-daily-n')) || 1 } catch (_) { return 1 } })())
const noLoans = ref(false)
function pick(v) { n.value = v; try { localStorage.setItem('bf-daily-n', String(v)) } catch (_) {} }

const DAY = 86400000
const today = todayISO()
const addDays = (iso, k) => new Date(Date.parse(iso) + k * DAY).toISOString().slice(0, 10)
const between = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1

const r = computed(() => {
  const first = firstTxDate.value
  if (!first) return null
  const from0 = monthsBack(today, n.value)
  const from = first > from0 ? first : from0
  const count = between(from, today)
  const { days, byCat } = dailySpend(from, today, { noLoans: noLoans.value })
  const list = Object.entries(days).map(([d, v]) => ({ d, v }))
  const total = list.reduce((s, x) => s + x.v, 0)
  const avg = total / count
  const sorted = list.map((x) => x.v).sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const max = list.reduce((m, x) => (x.v > m.v ? x : m), { d: null, v: 0 })
  const zero = list.filter((x) => x.v === 0).length

  // Perioada anterioară, de aceeași lungime, doar dacă avem date pentru ea toată
  let delta = null
  const prevTo = addDays(from, -1), prevFrom = addDays(from, -count)
  if (prevFrom >= first) {
    const p = Object.values(dailySpend(prevFrom, prevTo, { noLoans: noLoans.value }).days).reduce((s, v) => s + v, 0)
    if (p > 0) delta = Math.round(((total - p) / p) * 100)
  }

  // Zilele săptămânii: media pe fiecare zi (L–D)
  const wsum = Array(7).fill(0), wcnt = Array(7).fill(0)
  for (const x of list) { const w = (new Date(x.d).getUTCDay() + 6) % 7; wsum[w] += x.v; wcnt[w]++ }
  const wavg = wsum.map((s, i) => (wcnt[i] ? s / wcnt[i] : 0))
  const wmax = Math.max(1, ...wavg)
  const wtop = wavg.indexOf(Math.max(...wavg))

  // Graficul: zile (1 lună), săptămâni (3–6 luni), luni (12 luni); valoarea = media pe zi
  let bars = []
  if (n.value === 1) bars = list.map((x) => ({ key: x.d, v: x.v, label: dateShort(x.d) }))
  else if (n.value === 12) {
    const by = {}
    for (const x of list) (by[x.d.slice(0, 7)] ??= []).push(x.v)
    bars = Object.entries(by).map(([k, vs]) => ({ key: k, v: vs.reduce((a, b) => a + b, 0) / vs.length, label: monthShort(Number(k.slice(5)) - 1) }))
  } else {
    for (let i = 0; i < list.length; i += 7) {
      const ch = list.slice(i, i + 7)
      bars.push({ key: ch[0].d, v: ch.reduce((a, b) => a + b.v, 0) / ch.length, label: dateShort(ch[0].d) })
    }
  }
  const bmax = Math.max(1, ...bars.map((b) => b.v))
  const topBar = bars.reduce((m, b) => (b.v > m.v ? b : m), { v: -1 })
  bars = bars.map((b) => ({ ...b, h: Math.max(2, Math.round((b.v / bmax) * 120)), top: b === topBar && b.v > 0 }))

  const cats = Object.entries(byCat)
    .map(([id, v]) => ({ id, v: v / count, share: total ? Math.round((v / total) * 100) : 0, cat: categoryById(id) }))
    .sort((a, b) => b.v - a.v).slice(0, 6)
  const cmax = cats[0]?.v || 1

  // Estimare pentru luna curentă (doar pe 1 lună)
  let projection = null
  if (n.value === 1) {
    const [mf, mt] = monthRange(today)
    const start = mf < first ? first : mf
    const elapsed = between(start, today)
    if (elapsed >= 3) {
      const spent = Object.values(dailySpend(start, today, { noLoans: noLoans.value }).days).reduce((s, v) => s + v, 0)
      projection = (spent / elapsed) * between(start, mt)
    }
  }

  return {
    from, partial: from !== from0, count, total, avg, median, max, zero, delta,
    wavg: wavg.map((v, i) => ({ v, h: Math.max(3, Math.round((v / wmax) * 64)), top: i === wtop && v > 0 })), wtop: wavg[wtop] > 0 ? wtop : null,
    bars, avgPos: Math.min(120, Math.round((avg / bmax) * 120)),
    cats: cats.map((c) => ({ ...c, w: Math.round((c.v / cmax) * 100) })),
    projection,
  }
})

const scale = computed(() => (n.value === 1 ? t('dByDay') : n.value === 12 ? t('dByMonth') : t('dByWeek')))
const aria = computed(() => (r.value ? r.value.bars.map((b) => `${b.label}: ${money0(b.v)}`).join('; ') : ''))
</script>

<template>
  <section class="bf-card stack" aria-labelledby="daily-h">
    <div class="sec-head">
      <h2 id="daily-h" class="h-sec">{{ t('dailyTitle') }}</h2>
    </div>
    <div class="bf-chips">
      <button v-for="v in [1, 3, 6, 12]" :key="v" type="button" class="bf-chip" :class="{ 'bf-chip--on': n === v }" :aria-pressed="n === v" @click="pick(v)">{{ t('nMonths', v) }}</button>
    </div>

    <div v-if="!r || !r.total" class="empty" style="padding: 12px 0;">{{ t('dEmpty') }}</div>
    <template v-else>
      <div>
        <div class="bf-balance__label">{{ t('dAvg') }}</div>
        <div class="bf-balance__amount" style="font-size: 30px;">{{ money(r.avg) }}<span class="bf-balance__cur">MDL</span></div>
        <div v-if="r.delta !== null" class="bf-budget__note" style="margin-top: 4px;">
          <b :class="r.delta > 0 ? 'bf-expense' : 'bf-income'">{{ r.delta > 0 ? '+' : r.delta < 0 ? '−' : '' }}{{ Math.abs(r.delta) }}%</b> {{ t('dVsPrev') }}
        </div>
      </div>

      <div>
        <div role="img" :aria-label="aria" class="dbars">
          <div v-for="b in r.bars" :key="b.key" class="dbars__b" :class="{ 'dbars__b--zero': b.v === 0, 'dbars__b--max': b.top }" :style="{ height: b.h + 'px' }" :title="`${b.label}: ${money0(b.v)} MDL`"></div>
          <div class="dbars__avg" :style="{ bottom: r.avgPos + 'px' }"></div>
        </div>
        <div class="dbars__axis cap"><span>{{ r.bars[0]?.label }}</span><span>{{ scale }} · {{ t('dAvgLine') }}</span><span>{{ r.bars.at(-1)?.label }}</span></div>
      </div>

      <div class="dstats">
        <div class="dstat"><div class="dstat__v">{{ money0(r.median) }}</div><div class="dstat__l">{{ t('dMedian') }} ({{ t('dMedianSub') }})</div></div>
        <div class="dstat"><div class="dstat__v bf-expense">{{ money0(r.max.v) }}</div><div class="dstat__l">{{ t('dMax') }}<span v-if="r.max.d"> · {{ dateShort(r.max.d) }}</span></div></div>
        <div class="dstat"><div class="dstat__v">{{ r.zero }} / {{ r.count }}</div><div class="dstat__l">{{ t('dZero') }}</div></div>
        <div class="dstat"><div class="dstat__v">{{ money0(r.total) }}</div><div class="dstat__l">{{ t('dTotal') }}</div></div>
      </div>

      <p v-if="r.projection" class="bf-banner" style="margin: 0;">{{ t('dProjection', money0(r.projection)) }}</p>

      <div class="stack">
        <h3 class="h-sec" style="font-size: 15px;">{{ t('dWeekday') }}</h3>
        <div class="wd" role="img" :aria-label="r.wavg.map((w, i) => `${t('wdShort')[i]}: ${money0(w.v)}`).join(', ')">
          <div v-for="(w, i) in r.wavg" :key="i">
            <span class="cap" style="font-variant-numeric: tabular-nums;">{{ money0(w.v) }}</span>
            <i :class="{ top: w.top }" :style="{ height: w.h + 'px' }"></i>
            <span class="cap">{{ t('wdShort')[i] }}</span>
          </div>
        </div>
        <p v-if="r.wtop !== null" class="hint" style="margin: 0;">{{ t('dTopWd', t('wdLong')[r.wtop]) }}</p>
      </div>

      <div v-if="r.cats.length" class="stack">
        <h3 class="h-sec" style="font-size: 15px;">{{ t('dCats') }}</h3>
        <button v-for="c in r.cats" :key="c.id" type="button" style="all: unset; cursor: pointer; display: block;" @click="c.cat && router.push({ path: '/transactions', query: { category: c.id } })">
          <div class="bf-budget__top"><span class="bf-budget__name" style="font-size: 14px;">{{ c.cat ? catName(c.cat) : '—' }}</span><span class="bf-budget__nums">{{ money(c.v) }} {{ t('perDayShort') }} · {{ c.share }}%</span></div>
          <div class="bf-bar" style="height: 6px; margin-top: 6px;"><i :style="{ width: c.w + '%' }"></i></div>
        </button>
      </div>

      <label class="kv" style="cursor: pointer;">
        <span class="muted">{{ t('dNoLoans') }}</span>
        <input v-model="noLoans" type="checkbox" class="sw">
      </label>
      <p v-if="r.partial" class="hint" style="margin: 0;">{{ t('dSince', dateShort(r.from, true)) }}</p>
    </template>
  </section>
</template>
