<script setup>
import { ref, watch } from 'vue'
import Icon from './Icon.vue'
import { haptic } from '../lib/telegram.js'
import { t } from '../lib/i18n.js'

const props = defineProps({
  title: { type: String, default: '' },
  sub: { type: String, default: '' },
  error: { type: String, default: '' },
  length: { type: Number, default: 4 },
  busy: { type: Boolean, default: false },
  showBio: { type: Boolean, default: false },
  showForgot: { type: Boolean, default: false },
})
const emit = defineEmits(['done', 'bio', 'forgot'])
const code = ref('')
const shake = ref(false)

watch(() => props.error, (e) => { if (e) { code.value = ''; shake.value = true; haptic('error'); setTimeout(() => (shake.value = false), 400) } })

function press(d) {
  if (props.busy || code.value.length >= props.length) return
  haptic('light')
  code.value += d
  if (code.value.length === props.length) {
    const c = code.value
    setTimeout(() => { emit('done', c); code.value = '' }, 120)
  }
}
const back = () => { code.value = code.value.slice(0, -1) }
function onKey(e) {
  if (/^\d$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') back()
}
</script>

<template>
  <div class="pin" tabindex="0" @keydown="onKey">
    <div class="pin__lock"><Icon name="lock" :size="28" /></div>
    <h1 class="h-title" style="text-align: center;">{{ title }}</h1>
    <p v-if="sub" class="muted" style="margin: -4px 0 0; text-align: center; font: 500 14px/20px var(--font-sans);">{{ sub }}</p>
    <div class="pin__dots" :class="{ 'pin__dots--shake': shake }" role="status" :aria-label="`${code.length} / ${length}`">
      <span v-for="i in length" :key="i" class="pin__dot" :class="{ on: i <= code.length }"></span>
    </div>
    <p class="err" style="min-height: 18px; margin: 0; text-align: center;" role="alert">{{ error }}</p>
    <div class="pin__keys">
      <button v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="d" type="button" class="pin__key" :disabled="busy" @click="press(d)">{{ d }}</button>
      <button v-if="showBio" type="button" class="pin__key pin__key--ghost" :aria-label="t('lockUseBio')" @click="emit('bio')"><Icon name="faceid" :size="26" /></button>
      <span v-else></span>
      <button type="button" class="pin__key" :disabled="busy" @click="press('0')">0</button>
      <button type="button" class="pin__key pin__key--ghost" :aria-label="t('pinDelete')" :disabled="!code.length" @click="back">⌫</button>
    </div>
    <button v-if="showForgot" type="button" class="link" @click="emit('forgot')">{{ t('pinForgot') }}</button>
  </div>
</template>
