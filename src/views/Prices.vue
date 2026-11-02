<script setup>
// Istoricul prețurilor din bonurile scanate: cât a costat un produs, unde e mai ieftin, cum a crescut
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { prices } from '../store.js'
import { productKey } from '../lib/prices.js'
import { t } from '../lib/i18n.js'
import { money, dateShort } from '../lib/format.js'

const router = useRouter()
const q = ref('')
const sort = ref('often') // often | up | recent
const list = computed(() => {
  const k = productKey(q.value)
  let rows = prices.value.filter((p) => !k || p.key.includes(k))
  if (sort.value === 'up') rows = rows.filter((p) => p.count > 1).sort((a, b) => b.change - a.change)
  else if (sort.value === 'recent') rows = [...rows].sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  return rows.slice(0, 100)
})
const openKey = ref(null)
const cur = computed(() => prices.value.find((p) => p.key === openKey.value) || null)
const pctTxt = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`
const color = (v) => (v > 0.005 ? 'var(--expense)' : v < -0.005 ? 'var(--income)' : 'var(--ink-muted)')
// Grafic simplu (SVG) pentru evoluția prețului
const chart = computed(() => {
  const pts = cur.value?.points || []
  if (pts.length < 2) return null
  const W = 300, H = 90, P = 6
  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts[pts.length - 1].date) || t0 + 1
  const lo = cur.value.min, hi = cur.value.max === lo ? lo + 1 : cur.value.max
  const xy = pts.map((p) => [P + ((Date.parse(p.date) - t0) / Math.max(1, t1 - t0)) * (W - 2 * P), H - P - ((p.price - lo) / (hi - lo)) * (H - 2 * P)])
  return { W, H, d: xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), xy }
})
</script>

<template>
  <main class="page">
    <h1 class="h-title">{{ t('prTitle') }}</h1>

    <template v-if="cur">
      <button type="button" class="link" style="padding: 0; justify-self: start;" @click="openKey = null">← {{ t('prAll') }}</button>
      <div class="bf-card stack">
        <div style="font-weight: 700; font-size: 17px;">{{ cur.name }}</div>
        <div class="grid2" style="gap: 10px;">
          <div><div class="cap">{{ t('prLast') }}</div><b>{{ money(cur.last) }} MDL</b></div>
          <div><div class="cap">{{ t('prChange') }}</div><b :style="{ color: color(cur.change) }">{{ cur.count > 1 ? pctTxt(cur.change) : '—' }}</b></div>
          <div><div class="cap">{{ t('prMin') }}</div><b>{{ money(cur.min) }}</b></div>
          <div><div class="cap">{{ t('prMax') }}</div><b>{{ money(cur.max) }}</b></div>
        </div>
        <svg v-if="chart" :viewBox="`0 0 ${chart.W} ${chart.H}`" style="width: 100%; height: 90px;" role="img" :aria-label="t('prChart')">
          <path :d="chart.d" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" />
          <circle v-for="(p, i) in chart.xy" :key="i" :cx="p[0]" :cy="p[1]" r="3" fill="var(--brand)" />
        </svg>
      </div>
      <div v-if="cur.shops.length > 1" class="bf-card stack">
        <h2 class="h-sec">{{ t('prShops') }}</h2>
        <div v-for="(s, i) in cur.shops" :key="s.merchant" class="kv">
          <span>{{ s.merchant }} <span class="cap">· {{ dateShort(s.date, true) }}</span></span>
          <b :style="{ color: i === 0 ? 'var(--income)' : '' }">{{ money(s.price) }}</b>
        </div>
        <p class="hint" style="margin: 0;">{{ t('prCheapest', cur.shops[0].merchant, money(cur.shops[cur.shops.length - 1].price - cur.shops[0].price)) }}</p>
      </div>
      <div class="bf-card stack">
        <h2 class="h-sec">{{ t('prHistory') }}</h2>
        <button v-for="(p, i) in [...cur.points].reverse()" :key="i" type="button" class="kv" style="all: unset; cursor: pointer; display: flex; justify-content: space-between; gap: 8px;" @click="p.txId && router.push('/tx/' + p.txId)">
          <span>{{ dateShort(p.date, true) }} · {{ p.merchant || '—' }}<span v-if="p.qty !== 1" class="cap"> ×{{ String(p.qty).replace('.', ',') }}</span></span><b>{{ money(p.price) }}</b>
        </button>
      </div>
    </template>

    <template v-else>
      <input v-model="q" class="inp" type="search" :placeholder="t('prSearch')" :aria-label="t('prSearch')">
      <div class="bf-chips">
        <button v-for="s in ['often', 'up', 'recent']" :key="s" type="button" class="bf-chip" :class="{ 'bf-chip--on': sort === s }" @click="sort = s">{{ t('prSort_' + s) }}</button>
      </div>
      <div v-if="!prices.length" class="bf-card empty">{{ t('prEmpty') }}</div>
      <div v-else-if="!list.length" class="bf-card empty">{{ t('prNone') }}</div>
      <div v-else class="bf-card stack">
        <button v-for="p in list" :key="p.key" type="button" style="all: unset; cursor: pointer; display: flex; justify-content: space-between; gap: 10px; align-items: baseline;" @click="openKey = p.key">
          <span style="min-width: 0;"><span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ p.name }}</span><span class="cap">{{ t('prTimes', p.count) }} · {{ dateShort(p.lastDate, true) }}</span></span>
          <span style="text-align: right; white-space: nowrap;"><b>{{ money(p.last) }}</b><span v-if="p.count > 1" class="cap" :style="{ display: 'block', color: color(p.change) }">{{ pctTxt(p.change) }}</span></span>
        </button>
      </div>
      <p class="hint">{{ t('prHint') }}</p>
    </template>
  </main>
</template>
