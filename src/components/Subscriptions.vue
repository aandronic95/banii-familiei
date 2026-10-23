<script setup>
// Abonamente găsite automat: plăți lunare cu aceeași sumă (Netflix, telefon, sală…)
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { subscriptions } from '../store.js'
import { t } from '../lib/i18n.js'
import { money, money0, dateShort } from '../lib/format.js'

const router = useRouter()
const total = computed(() => subscriptions.value.reduce((s, x) => s + x.yearly, 0))
function track(s) {
  router.push({ path: '/recurring/new', query: { name: s.name, amount: String(s.monthly), account: s.account_id || '', category: s.category_id || '', day: String(s.day) } })
}
</script>

<template>
  <div class="bf-card stack" aria-labelledby="subs-h">
    <div class="sec-head">
      <h2 id="subs-h" class="h-sec">{{ t('subsTitle') }}</h2>
      <span v-if="subscriptions.length" class="cap">{{ money0(total) }} MDL / {{ t('yearShort') }}</span>
    </div>
    <p v-if="!subscriptions.length" class="hint" style="margin: 0;">{{ t('subsEmpty') }}</p>
    <div v-for="s in subscriptions" :key="s.key" class="kv" style="align-items: flex-start; gap: 12px;">
      <div style="min-width: 0;">
        <div style="font-weight: 600;">{{ s.name }}</div>
        <div class="cap">{{ t('subsLast', dateShort(s.lastDate), s.count) }}</div>
        <button v-if="!s.tracked" type="button" class="link" style="padding: 4px 0 0;" @click="track(s)">{{ t('subsTrack') }}</button>
        <span v-else class="cap bf-income">✓ {{ t('subsTracked') }}</span>
      </div>
      <div style="text-align: right; white-space: nowrap;">
        <b>{{ money(s.monthly) }}</b><div class="cap">{{ money0(s.yearly) }} / {{ t('yearShort') }}</div>
      </div>
    </div>
  </div>
</template>
