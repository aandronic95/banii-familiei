<script setup>
// Categorii propuse pentru tranzacțiile fără categorie: după același magazin sau după cuvinte; se confirmă toate odată
import { ref, computed, watch } from 'vue'
import { S, save, catSuggestions, txCurrency } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { money, dateShort } from '../lib/format.js'
import { haptic } from '../lib/telegram.js'
import { toast } from './Toast.js'

const off = ref(new Set())      // debifate
const pick = ref({})            // categoria schimbată de om
const all = ref(false)
const busy = ref(false)
const list = computed(() => catSuggestions.value.map((s) => ({ ...s, category_id: pick.value[s.tx.id] || s.category_id })))
const shown = computed(() => (all.value ? list.value : list.value.slice(0, 6)))
const on = computed(() => list.value.filter((s) => !off.value.has(s.tx.id)))
const cats = (kind) => S.categories.filter((c) => c.kind === kind && !c.archived)
function toggle(id) { const n = new Set(off.value); n.has(id) ? n.delete(id) : n.add(id); off.value = n }
watch(() => catSuggestions.value.length, () => { off.value = new Set([...off.value].filter((id) => catSuggestions.value.some((s) => s.tx.id === id))) })
async function apply() {
  busy.value = true
  let n = 0
  try {
    for (const s of on.value) { await save('transactions', { id: s.tx.id, category_id: s.category_id }); n++ }
    haptic('success'); toast(t('csDone', n))
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = false }
}
</script>

<template>
  <div v-if="list.length" class="stack">
    <div class="kv"><b>{{ t('csTitle', list.length) }}</b></div>
    <div v-for="s in shown" :key="s.tx.id" style="display: grid; grid-template-columns: 26px 1fr; gap: 8px; align-items: center;">
      <input type="checkbox" :checked="!off.has(s.tx.id)" style="width: 22px; height: 22px;" :aria-label="s.tx.merchant || '—'" @change="toggle(s.tx.id)">
      <div style="min-width: 0; display: grid; gap: 4px;">
        <div class="kv" style="gap: 8px;"><span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ s.tx.merchant || '—' }} <span class="cap">· {{ dateShort(s.tx.date) }}</span></span>
          <b style="white-space: nowrap;" :class="s.tx.kind === 'income' ? 'bf-income' : ''">{{ s.tx.kind === 'income' ? '+' : '−' }}{{ money(s.tx.amount) }} {{ txCurrency(s.tx) }}</b></div>
        <select class="inp" style="min-height: 36px; padding: 4px 10px;" :value="s.category_id" :aria-label="t('category')" @change="pick = { ...pick, [s.tx.id]: $event.target.value }">
          <option v-for="c in cats(s.tx.kind)" :key="c.id" :value="c.id">{{ catName(c) }}</option>
        </select>
      </div>
    </div>
    <button v-if="list.length > 6" type="button" class="link" style="padding: 0; justify-self: start;" @click="all = !all">{{ all ? t('salHide') : t('csAll', list.length) }}</button>
    <button type="button" class="bf-btn bf-btn--primary" :disabled="busy || !on.length" @click="apply">{{ t('csApply', on.length) }}</button>
    <p class="hint" style="margin: 0;">{{ t('csHint') }}</p>
  </div>
</template>
