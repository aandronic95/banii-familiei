<script setup>
// Averea netă lună de lună: conturi + investiții − credite
import { computed, ref } from 'vue'
import { netWorthSeries } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, monthShort } from '../lib/format.js'
import { privacy } from '../lib/privacy.js'

const pts = computed(() => netWorthSeries(12))
const now = computed(() => pts.value.at(-1))
const delta = (a, b) => (a && b ? a.net - b.net : null)
const dMonth = computed(() => delta(now.value, pts.value.at(-2)))
const dStart = computed(() => (pts.value.length > 2 ? delta(now.value, pts.value[0]) : null))
const sel = ref(null)
const shown = computed(() => (sel.value !== null ? pts.value[sel.value] : now.value))

// Grafic: coordonate în viewBox 320×120
const W = 320, H = 120, PAD = 8
const geo = computed(() => {
  const v = pts.value.map((p) => p.net)
  const lo = Math.min(...v), hi = Math.max(...v)
  const span = hi - lo || Math.abs(hi) || 1
  const x = (i) => (pts.value.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (pts.value.length - 1))
  const y = (val) => PAD + (H - 2 * PAD) * (1 - (val - lo) / span)
  const line = pts.value.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts.value.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  const zero = lo < 0 && hi > 0 ? y(0) : null
  return { x, y, line, area, zero }
})
const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '')
const aria = computed(() => pts.value.map((p) => `${monthShort(p.month)}: ${money0(p.net)}`).join('; '))
</script>

<template>
  <div class="bf-card stack">
    <h2 class="h-sec">{{ t('netWorth') }}</h2>
    <div>
      <div class="bf-balance__label">{{ sel !== null ? monthShort(shown.month) + ' ' + shown.iso.slice(0, 4) : t('nwNow') }}</div>
      <div class="bf-balance__amount" style="font-size: 30px;">{{ money0(shown.net) }}<span class="bf-balance__cur">MDL</span></div>
      <div class="bf-balance__meta" style="flex-wrap: wrap;">
        <span v-if="dMonth !== null">{{ t('nwVsMonth') }}: <b :class="dMonth >= 0 ? 'bf-income' : 'bf-expense'">{{ sign(dMonth) }}{{ money0(Math.abs(dMonth)) }}</b></span>
        <span v-if="dStart !== null">{{ t('nwVsStart', pts.length) }}: <b :class="dStart >= 0 ? 'bf-income' : 'bf-expense'">{{ sign(dStart) }}{{ money0(Math.abs(dStart)) }}</b></span>
      </div>
    </div>
    <svg v-if="pts.length > 1 && !privacy" :viewBox="`0 0 ${W} ${H + 18}`" role="img" :aria-label="aria" style="width: 100%; height: auto; overflow: visible;" @mouseleave="sel = null">
      <defs><linearGradient id="nwg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".22" /><stop offset="1" stop-color="var(--brand)" stop-opacity="0" /></linearGradient></defs>
      <line v-if="geo.zero !== null" x1="0" :x2="W" :y1="geo.zero" :y2="geo.zero" stroke="var(--line)" stroke-dasharray="3 3" />
      <path :d="geo.area" fill="url(#nwg)" />
      <path :d="geo.line" fill="none" stroke="var(--brand)" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" />
      <g v-for="(p, i) in pts" :key="p.iso">
        <circle :cx="geo.x(i)" :cy="geo.y(p.net)" :r="i === pts.length - 1 || sel === i ? 4 : 2.5" fill="var(--surface)" stroke="var(--brand)" stroke-width="2" />
        <text v-if="pts.length <= 7 || i % 2 === (pts.length - 1) % 2" :x="geo.x(i)" :y="H + 14" text-anchor="middle" font-size="10" fill="var(--ink-muted)">{{ monthShort(p.month) }}</text>
        <rect :x="geo.x(i) - 12" y="0" width="24" :height="H" fill="transparent" style="cursor: pointer;" @click="sel = sel === i ? null : i" @mouseenter="sel = i" />
      </g>
    </svg>
    <div class="kv"><span class="muted">{{ t('assets') }}</span><b>{{ money0(shown.assets) }} MDL</b></div>
    <div v-if="shown.property" class="kv"><span class="muted">{{ t('bunuri') }}</span><b>{{ money0(shown.property) }} MDL</b></div>
    <div v-if="shown.invest" class="kv"><span class="muted">{{ t('investments') }}</span><b>{{ money0(shown.invest) }} MDL</b></div>
    <div v-if="shown.goals" class="kv"><span class="muted">{{ t('goalsTitle') }}</span><b>{{ money0(shown.goals) }} MDL</b></div>
    <div v-if="shown.personal" class="kv"><span class="muted">{{ t('nwPersonal') }}</span><b :class="shown.personal < 0 ? 'bf-expense' : ''">{{ shown.personal > 0 ? '+' : '−' }}{{ money0(Math.abs(shown.personal)) }} MDL</b></div>
    <div class="kv"><span class="muted">{{ t('liabilities') }}</span><b class="bf-expense">−{{ money0(shown.debt) }} MDL</b></div>
    <p class="hint" style="margin: 0;">{{ t('nwHint') }} <button v-if="!shown.property" type="button" class="link" style="padding: 0;" @click="$router.push({ path: '/account/new', query: { type: 'asset' } })">{{ t('assetAdd') }} ›</button></p>
  </div>
</template>
