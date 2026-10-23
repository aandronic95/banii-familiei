<script setup>
// Număr care „curge” spre valoarea nouă (ex. când soția adaugă o cheltuială)
// și clipește scurt în verde/roșu. Respectă modul discret, prin money().
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { money } from '../lib/format.js'

const p = defineProps({
  value: { type: Number, default: 0 },
  decimals: { type: Number, default: 2 },
  duration: { type: Number, default: 700 },
  sign: { type: Boolean, default: false },
  flash: { type: Boolean, default: true },
})
const shown = ref(Number(p.value) || 0)
const dir = ref('')
let raf = 0, flashT = 0
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

watch(() => p.value, (to, from) => {
  to = Number(to) || 0
  cancelAnimationFrame(raf)
  if (p.flash && Math.abs(to - (Number(from) || 0)) >= 0.005) {
    dir.value = to > from ? 'up' : 'down'
    clearTimeout(flashT)
    flashT = setTimeout(() => { dir.value = '' }, 1100)
  }
  const start = shown.value
  if (reduced || document.visibilityState === 'hidden' || Math.abs(to - start) < 1e-12) { shown.value = to; return }
  const t0 = performance.now()
  const step = (now) => {
    const k = Math.min(1, (now - t0) / p.duration)
    shown.value = start + (to - start) * (1 - Math.pow(1 - k, 3))
    if (k < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
})
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearTimeout(flashT) })
const text = computed(() => {
  const s = money(shown.value, p.decimals)
  return p.sign && shown.value >= 0 && s !== '•••' ? '+' + s : s
})
</script>

<template><span class="anum" :class="dir && 'anum--' + dir">{{ text }}</span></template>
