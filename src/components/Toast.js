import { ref } from 'vue'

export const toastText = ref('')
let timer = null
export function toast(text) {
  toastText.value = text
  clearTimeout(timer)
  timer = setTimeout(() => (toastText.value = ''), 2200)
}
