<script setup>
// Fond de urgență: câte luni de cheltuieli acoperă banii la îndemână
import { computed, ref } from 'vue'
import { emergency, savePrefs } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0 } from '../lib/format.js'

const e = emergency
const editing = ref(false)
const fmt = (n) => (n === null ? '—' : n >= 10 ? Math.round(n) : n.toFixed(1).replace('.', ','))
const tone = computed(() => (e.value.months === null ? '' : e.value.months >= e.value.target ? 'var(--income)' : e.value.months >= 3 ? 'var(--warning)' : 'var(--danger)'))
async function setTarget(n) { editing.value = false; await savePrefs({ emergencyMonths: n }) }
</script>

<template>
  <section class="bf-card stack" aria-labelledby="em-h">
    <div class="sec-head">
      <h2 id="em-h" class="h-sec">{{ t('emTitle') }}</h2>
      <button type="button" class="link" @click="editing = !editing">{{ t('emTarget', e.target) }}</button>
    </div>
    <div v-if="editing" class="bf-chips">
      <button v-for="n in [3, 6, 9, 12]" :key="n" type="button" class="bf-chip" :class="{ 'bf-chip--on': e.target === n }" @click="setTarget(n)">{{ t('nMonths', n) }}</button>
    </div>
    <template v-if="e.months !== null">
      <div style="display: flex; align-items: baseline; gap: 8px;">
        <span class="bf-balance__amount" style="font-size: 30px;" :style="{ color: tone }">{{ fmt(e.months) }}</span>
        <span class="muted">{{ t('emMonths', e.target) }}</span>
      </div>
      <div class="bf-bar" style="margin-top: 0;"><i :style="{ width: e.pct * 100 + '%', background: tone }"></i></div>
      <div class="kv"><span class="muted">{{ t('emHave') }}</span><b>{{ money0(e.have) }} MDL</b></div>
      <div class="kv"><span class="muted">{{ t('emMonthly') }}</span><b>{{ money0(e.monthly) }} MDL</b></div>
      <div v-if="e.need > 0" class="kv"><span class="muted">{{ t('emNeed', e.target) }}</span><b class="bf-expense">{{ money0(e.need) }} MDL</b></div>
      <p v-else class="hint bf-income" style="margin: 0;">✓ {{ t('emDone') }}</p>
    </template>
    <p v-else class="hint" style="margin: 0;">{{ t('emEmpty') }}</p>
  </section>
</template>
