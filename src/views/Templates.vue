<script setup>
// Șabloanele de pe Acasă: le vezi și le ștergi (se creează din „Tranzacție nouă” → „Salvează și ca șablon”)
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, remove, save, accountById, categoryById } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money } from '../lib/format.js'
import { confirmDialog } from '../lib/telegram.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const list = computed(() => [...S.templates].sort((a, b) => a.sort - b.sort))
async function del(tp) {
  if (await confirmDialog(t('tplDeleteQ', tp.name))) await remove('templates', tp.id)
}
async function move(i, d) {
  const a = list.value[i], b = list.value[i + d]
  if (!a || !b) return
  await save('templates', { id: a.id, sort: b.sort }); await save('templates', { id: b.id, sort: a.sort === b.sort ? a.sort + d : a.sort })
}
</script>

<template>
  <main class="page">
    <h1 class="h-title">{{ t('tplTitle') }}</h1>
    <div v-if="!list.length" class="bf-card empty stack">
      <span>{{ t('tplEmpty') }}</span>
      <button type="button" class="bf-btn bf-btn--primary" @click="router.push('/tx/new')">{{ t('newTx') }}</button>
    </div>
    <div v-else class="bf-list">
      <div v-for="(tp, i) in list" :key="tp.id" class="bf-row">
        <div class="bf-row__icon"><Icon :name="categoryById(tp.category_id)?.icon || 'bolt'" /></div>
        <div class="bf-row__body">
          <div class="bf-row__title">{{ tp.name }}</div>
          <div class="bf-row__sub">{{ [catName(categoryById(tp.category_id)), accountById(tp.account_id)?.name, ...(tp.tags || []).map((x) => '#' + x)].filter(Boolean).join(' · ') }}</div>
        </div>
        <div class="bf-row__amount">{{ tp.kind === 'income' ? '+' : '−' }}{{ money(tp.amount) }}<small>{{ accountById(tp.account_id)?.currency }}</small></div>
        <div style="display: flex; flex-direction: column;">
          <button type="button" class="amt-op" style="width: 32px; height: 28px;" :disabled="i === 0" :aria-label="t('moveUp')" @click="move(i, -1)">↑</button>
          <button type="button" class="amt-op" style="width: 32px; height: 28px;" :disabled="i === list.length - 1" :aria-label="t('moveDown')" @click="move(i, 1)">↓</button>
        </div>
        <button type="button" class="amt-op" :aria-label="t('delete')" @click="del(tp)"><Icon name="trash" :size="16" /></button>
      </div>
    </div>
    <p class="hint">{{ t('tplHint') }}</p>
  </main>
</template>
