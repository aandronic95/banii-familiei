<script setup>
// Proiecte = etichete: cât a costat #vacanța, #renovarea etc.
import { useRouter } from 'vue-router'
import { tagStats } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, dateShort } from '../lib/format.js'

const router = useRouter()
const span = (r) => (r.from === r.to ? dateShort(r.from, true) : `${dateShort(r.from, r.from.slice(0, 4) !== r.to.slice(0, 4))} – ${dateShort(r.to, true)}`)
</script>

<template>
  <div class="bf-card stack">
    <h2 class="h-sec">{{ t('projTitle') }}</h2>
    <p v-if="!tagStats.length" class="hint" style="margin: 0;">{{ t('projEmpty') }}</p>
    <button v-for="r in tagStats" :key="r.tag" type="button" class="kv" style="all: unset; display: flex; justify-content: space-between; gap: 12px; cursor: pointer;" @click="router.push({ path: '/transactions', query: { tag: r.tag } })">
      <span style="min-width: 0;">
        <b>#{{ r.tag }}</b>
        <span class="cap" style="display: block;">{{ span(r) }} · {{ t('projCount', r.count) }}</span>
      </span>
      <span style="text-align: right; white-space: nowrap;">
        <b class="bf-expense">−{{ money0(r.exp) }} MDL</b>
        <span v-if="r.inc" class="cap bf-income" style="display: block;">+{{ money0(r.inc) }}</span>
      </span>
    </button>
  </div>
</template>
