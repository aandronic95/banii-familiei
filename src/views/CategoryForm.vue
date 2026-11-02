<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, save } from '../store.js'
import { bucketOf } from '../lib/home.js'
import { t } from '../lib/i18n.js'
import { parseAmount } from '../lib/format.js'
import { haptic } from '../lib/telegram.js'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.categories.find((c) => c.id === route.params.id)
const icons = ['cart', 'car', 'school', 'home', 'bolt', 'heart', 'shirt', 'ticket', 'bank', 'gift', 'wallet', 'percent', 'wrench', 'tag']
const f = reactive({
  kind: orig?.kind ?? 'expense', name_ro: orig?.name_ro ?? '', name_ru: orig?.name_ru ?? '', icon: orig?.icon ?? 'tag',
  budget: orig?.budget ? String(orig.budget).replace('.', ',') : '',
  bucket: orig?.bucket ?? '',
  for_member_id: orig?.for_member_id ?? '',
})
const err = ref('')
async function submit() {
  if (!f.name_ro.trim()) { err.value = t('nameRo'); return }
  try {
    await save('categories', {
      ...(orig ? { id: orig.id } : { sort: S.categories.length + 1 }), kind: f.kind,
      name_ro: f.name_ro.trim(), name_ru: f.name_ru.trim() || f.name_ro.trim(), icon: f.icon,
      budget: f.kind === 'expense' && parseAmount(f.budget) > 0 ? parseAmount(f.budget) : null,
      bucket: f.kind === 'expense' && f.bucket ? f.bucket : null,
      for_member_id: f.kind === 'expense' && f.for_member_id ? f.for_member_id : null,
    })
    haptic('success'); router.back()
  } catch (e) { console.error(e); err.value = t('error', e) }
}
async function archive() {
  await save('categories', { id: orig.id, archived: true }); router.back()
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ isNew ? t('newCategory') : t('category') }}</h1>
    <div v-if="isNew" class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
      <button type="button" :class="{ on: f.kind === 'expense' }" @click="f.kind = 'expense'">{{ t('expense') }}</button>
      <button type="button" :class="{ on: f.kind === 'income' }" @click="f.kind = 'income'">{{ t('income') }}</button>
    </div>
    <div class="fld"><label for="c-ro">{{ t('nameRo') }}</label><input id="c-ro" v-model="f.name_ro" class="inp" maxlength="30"></div>
    <div class="fld"><label for="c-ru">{{ t('nameRu') }}</label><input id="c-ru" v-model="f.name_ru" class="inp" maxlength="30"></div>
    <div v-if="f.kind === 'expense'" class="fld"><label for="c-b">{{ t('budget') }}, MDL</label><input id="c-b" v-model="f.budget" class="inp" inputmode="decimal" :placeholder="t('noBudget')"></div>
    <div v-if="f.kind === 'expense'" class="fld">
      <span class="lbl">{{ t('r53Bucket') }}</span>
      <div class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
        <button type="button" :class="{ on: !f.bucket }" @click="f.bucket = ''">{{ t('r53Auto', t('r53_' + bucketOf({ icon: f.icon }))) }}</button>
        <button type="button" :class="{ on: f.bucket === 'needs' }" @click="f.bucket = 'needs'">{{ t('r53_needs') }}</button>
        <button type="button" :class="{ on: f.bucket === 'wants' }" @click="f.bucket = 'wants'">{{ t('r53_wants') }}</button>
      </div>
    </div>
    <div v-if="f.kind === 'expense' && S.members.length > 1" class="fld">
      <span class="lbl">{{ t('forWhomDefault') }}</span>
      <div class="bf-chips">
        <button type="button" class="bf-chip" :class="{ 'bf-chip--on': !f.for_member_id }" @click="f.for_member_id = ''">{{ t('forAll') }}</button>
        <button v-for="m in S.members" :key="m.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.for_member_id === m.id }" @click="f.for_member_id = m.id"><span :class="`bf-dot bf-p${m.color}`"></span>{{ m.name }}</button>
      </div>
      <p class="hint" style="margin: 0;">{{ t('forWhomHint') }}</p>
    </div>
    <div class="fld">
      <span class="lbl">{{ t('icon') }}</span>
      <div class="bf-chips">
        <button v-for="i in icons" :key="i" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.icon === i }" style="width: 44px; height: 44px; justify-content: center; padding: 0;" :aria-label="i" @click="f.icon = i"><Icon :name="i" /></button>
      </div>
    </div>
    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="archive">{{ t('archive') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
