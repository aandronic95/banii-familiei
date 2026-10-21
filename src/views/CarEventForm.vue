<script setup>
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, save, remove } from '../store.js'
import { t } from '../lib/i18n.js'
import { parseAmount } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.carEvents.find((e) => e.id === route.params.id)
const kinds = { rca: 'rca', casco: 'casco', inspection: 'inspection', service: 'serviceDue' }
const f = reactive({
  car_id: orig?.car_id ?? route.query.car ?? S.cars[0]?.id,
  kind: orig?.kind ?? 'rca', title: orig?.title ?? t('rca'),
  due_date: orig?.due_date ?? '', due_km: orig?.due_km ?? '', amount: orig?.amount ? String(orig.amount).replace('.', ',') : '',
})
watch(() => f.kind, (k, old) => { if (!f.title || f.title === t(kinds[old])) f.title = t(kinds[k]) })
const err = ref('')

async function submit() {
  if (!f.title.trim() || (!f.due_date && !f.due_km)) { err.value = t('dueDate'); return }
  try {
    await save('car_events', {
      ...(orig ? { id: orig.id } : {}), car_id: f.car_id, kind: f.kind, title: f.title.trim(),
      due_date: f.due_date || null, due_km: parseInt(String(f.due_km).replace(/\D/g, '')) || null, amount: parseAmount(f.amount) || null, done: false,
    })
    haptic('success'); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) }
}
async function del() {
  if (!(await confirmDialog(t('delete') + '?'))) return
  await remove('car_events', orig.id); router.back()
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ t('addEvent') }}</h1>
    <div class="fld">
      <span class="lbl">{{ t('eventKind') }}</span>
      <div class="bf-chips">
        <button v-for="(label, k) in kinds" :key="k" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.kind === k }" @click="f.kind = k">{{ t(label) }}</button>
      </div>
    </div>
    <div class="fld"><label for="e-t">{{ t('name') }}</label><input id="e-t" v-model="f.title" class="inp" maxlength="40"></div>
    <div class="grid2">
      <div class="fld"><label for="e-d">{{ t('dueDate') }}</label><input id="e-d" v-model="f.due_date" type="date" class="inp"></div>
      <div class="fld"><label for="e-k">{{ t('dueKm') }}</label><input id="e-k" v-model="f.due_km" class="inp" inputmode="numeric"></div>
    </div>
    <div class="fld"><label for="e-a">{{ t('amount') }}, MDL</label><input id="e-a" v-model="f.amount" class="inp" inputmode="decimal" :placeholder="t('optional')"></div>
    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del">{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
