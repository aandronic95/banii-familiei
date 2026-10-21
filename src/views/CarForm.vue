<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, save, remove } from '../store.js'
import { t } from '../lib/i18n.js'
import { confirmDialog, haptic } from '../lib/telegram.js'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.cars.find((c) => c.id === route.params.id)
const f = reactive({ name: orig?.name ?? '', plate: orig?.plate ?? '', odometer_start: orig?.odometer_start ?? '' })
const err = ref('')

async function submit() {
  if (!f.name.trim()) { err.value = t('carName'); return }
  try {
    await save('cars', { ...(orig ? { id: orig.id } : {}), name: f.name.trim(), plate: f.plate.trim() || null, odometer_start: parseInt(String(f.odometer_start).replace(/\D/g, '')) || 0 })
    haptic('success'); router.back()
  } catch (e) { console.error(e); err.value = t('error') }
}
async function del() {
  if (!(await confirmDialog(t('delete') + '?'))) return
  await remove('cars', orig.id); router.back()
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ isNew ? t('newCar') : orig?.name }}</h1>
    <div class="fld"><label for="c-n">{{ t('carName') }}</label><input id="c-n" v-model="f.name" class="inp" maxlength="40"></div>
    <div class="grid2">
      <div class="fld"><label for="c-p">{{ t('plate') }}</label><input id="c-p" v-model="f.plate" class="inp" maxlength="12"></div>
      <div class="fld"><label for="c-o">{{ t('startKm') }}</label><input id="c-o" v-model="f.odometer_start" class="inp" inputmode="numeric"></div>
    </div>
    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del">{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
