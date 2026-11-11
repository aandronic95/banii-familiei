<script setup>
// Luna asta față de trecuta, pe aceleași zile: unde se cheltuie mai mult sau mai puțin
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { monthCmp, categoryById } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money0 } from '../lib/format.js'

const router = useRouter()
const c = monthCmp
const all = ref(false)
const rows = computed(() => (all.value ? c.value.rows : c.value.rows.slice(0, 4)))
const max = computed(() => Math.max(1, ...c.value.rows.map((r) => Math.max(r.cur, r.prev))))
const name = (r) => (r.category_id ? catName(categoryById(r.category_id)) : t('noCategory'))
const open = (r) => router.push(r.category_id ? { path: '/transactions', query: { category: r.category_id } } : { path: '/transactions', query: { uncat: '1' } })
</script>

<template>
  <section v-if="c.prev > 0 || c.cur > 0" class="bf-card stack" aria-labelledby="mc-h">
    <div class="sec-head"><h2 id="mc-h" class="h-sec">{{ t('mcTitle') }}</h2><span class="cap">{{ t('mcDays', c.day) }}</span></div>
    <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
      <span class="bf-balance__amount" style="font-size: 26px;">{{ money0(c.cur) }}</span>
      <span class="muted">{{ t('mcVs', money0(c.prev)) }}</span>
      <b v-if="c.pct !== null" :style="{ color: c.diff > 0 ? 'var(--expense)' : 'var(--income)' }">{{ c.diff > 0 ? '▲' : '▼' }} {{ Math.abs(Math.round(c.pct * 100)) }}%</b>
    </div>
    <button v-for="r in rows" :key="r.category_id || '-'" type="button" style="all: unset; cursor: pointer; display: grid; gap: 3px;" @click="open(r)">
      <div class="kv"><span>{{ name(r) }}</span><b :style="{ color: r.diff > 0 ? 'var(--expense)' : 'var(--income)' }">{{ r.diff > 0 ? '+' : '−' }}{{ money0(Math.abs(r.diff)) }}</b></div>
      <div style="display: grid; gap: 2px;">
        <div style="height: 5px; border-radius: 3px; background: var(--brand);" :style="{ width: Math.max(2, (r.cur / max) * 100) + '%' }"></div>
        <div style="height: 5px; border-radius: 3px; background: var(--ink-muted); opacity: 0.45;" :style="{ width: Math.max(2, (r.prev / max) * 100) + '%' }"></div>
      </div>
      <span class="cap">{{ t('mcLine', money0(r.cur), money0(r.prev)) }}</span>
    </button>
    <p v-if="!c.rows.length" class="hint" style="margin: 0;">{{ t('mcSame') }}</p>
    <button v-if="c.rows.length > 4" type="button" class="link" style="padding: 0; justify-self: start;" @click="all = !all">{{ all ? t('salHide') : t('mcAll', c.rows.length) }}</button>
  </section>
</template>
