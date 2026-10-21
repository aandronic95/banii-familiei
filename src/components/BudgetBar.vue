<script setup>
import { computed } from 'vue'
import { catName, t } from '../lib/i18n.js'
import { money0 } from '../lib/format.js'

const props = defineProps({ row: { type: Object, required: true }, showNote: { type: Boolean, default: true } })
const note = computed(() => {
  const r = props.row
  if (r.state === 'over') return t('over', money0(r.spent - r.budget))
  return t('left', money0(r.budget - r.spent))
})
</script>

<template>
  <div>
    <div class="bf-budget__top">
      <span class="bf-budget__name">{{ catName(row.cat) }}</span>
      <span class="bf-budget__nums">{{ money0(row.spent) }} / {{ money0(row.budget) }}</span>
    </div>
    <div class="bf-bar" :class="{ 'bf-bar--warn': row.state === 'warn', 'bf-bar--over': row.state === 'over' }"
         role="progressbar" :aria-valuenow="Math.round(row.pct * 100)" aria-valuemin="0" aria-valuemax="100">
      <i :style="{ width: Math.min(100, row.pct * 100) + '%' }"></i>
    </div>
    <div v-if="showNote" class="bf-budget__note" :class="{ 'bf-budget__note--warn': row.state === 'warn', 'bf-budget__note--over': row.state === 'over' }">{{ note }}</div>
  </div>
</template>
