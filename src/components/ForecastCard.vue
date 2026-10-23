<script setup>
// Cât veți avea pe carduri + cash în 30/60/90 de zile (plăți programate + cheltuiala medie de zi cu zi)
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { forecast } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, dateShort } from '../lib/format.js'
import { privacy } from '../lib/privacy.js'
import Icon from './Icon.vue'

const router = useRouter()
const days = ref((() => { try { return Number(localStorage.getItem('bf-fc-days')) || 60 } catch (_) { return 60 } })())
function pick(d) { days.value = d; try { localStorage.setItem('bf-fc-days', String(d)) } catch (_) {} }
const fc = computed(() => forecast(days.value))

const W = 320, H = 90
const geo = computed(() => {
  const v = fc.value.points.map((p) => p.bal)
  const lo = Math.min(0, ...v), hi = Math.max(...v, 1)
  const x = (i) => (i / (v.length - 1)) * W
  const y = (b) => 4 + (H - 8) * (1 - (b - lo) / (hi - lo || 1))
  return {
    line: v.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(b).toFixed(1)}`).join(' '),
    zero: lo < 0 ? y(0) : null,
    dots: fc.value.points.map((p, i) => (p.events?.length ? { x: x(i), y: y(p.bal), up: p.events.some((e) => e.sign > 0) } : null)).filter(Boolean),
    lowX: x(fc.value.points.findIndex((p) => p.date === fc.value.low.date)), lowY: y(fc.value.low.bal),
  }
})
const aria = computed(() => t('fcAria', money0(fc.value.start), money0(fc.value.end), days.value))
</script>

<template>
  <section class="bf-card stack" aria-labelledby="fc-h">
    <div class="sec-head">
      <h2 id="fc-h" class="h-sec">{{ t('fcTitle') }}</h2>
      <div class="bf-chips" style="flex-wrap: nowrap;">
        <button v-for="d in [30, 60, 90]" :key="d" type="button" class="bf-chip" style="min-height: 30px; padding: 0 10px; font-size: 13px;" :class="{ 'bf-chip--on': days === d }" @click="pick(d)">{{ d }} {{ t('daysShort') }}</button>
      </div>
    </div>
    <div class="kv" style="align-items: flex-end;">
      <div>
        <div class="bf-balance__label">{{ t('fcIn', days) }}</div>
        <div class="bf-balance__amount" style="font-size: 26px;" :class="{ 'bf-expense': fc.end < 0 }">{{ money0(fc.end) }}<span class="bf-balance__cur">MDL</span></div>
      </div>
      <div style="text-align: right;" class="cap">{{ t('fcNow') }} {{ money0(fc.start) }}<br>{{ t('fcLow') }} <b :class="{ 'bf-expense': fc.low.bal < 0 }">{{ money0(fc.low.bal) }}</b> · {{ dateShort(fc.low.date) }}</div>
    </div>
    <svg v-if="!privacy" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="aria" style="width: 100%; height: auto; overflow: visible;">
      <line v-if="geo.zero !== null" x1="0" :x2="W" :y1="geo.zero" :y2="geo.zero" stroke="var(--danger)" stroke-dasharray="3 3" opacity=".6" />
      <path :d="geo.line" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" />
      <circle v-for="(d, i) in geo.dots" :key="i" :cx="d.x" :cy="d.y" r="2.6" :fill="d.up ? 'var(--income)' : 'var(--expense)'" />
      <circle :cx="geo.lowX" :cy="geo.lowY" r="4" fill="none" stroke="var(--warning)" stroke-width="2" />
    </svg>
    <div v-if="fc.firstNeg" class="bf-banner bf-banner--danger"><Icon name="alert" /><div>{{ t('fcNeg', dateShort(fc.firstNeg.date)) }}</div></div>
    <p class="hint" style="margin: 0;">{{ t('fcHint', money0(fc.daily)) }} <button type="button" class="link" style="padding: 0;" @click="router.push('/calendar')">{{ t('calendarTitle') }} ›</button></p>
  </section>
</template>
