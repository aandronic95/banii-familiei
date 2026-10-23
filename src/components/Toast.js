import { ref } from 'vue'

// Mesaj scurt jos pe ecran, opțional cu un buton (ex. „Anulează” după ștergere)
export const toastText = ref('')
export const toastAction = ref(null)
let timer = null
let pendingDone = null

function finish() {
  const done = pendingDone
  pendingDone = null
  toastText.value = ''
  toastAction.value = null
  done?.()
}

export function toast(text, opts = {}) {
  if (pendingDone) { const d = pendingDone; pendingDone = null; d() } // mesajul anterior se încheie normal
  clearTimeout(timer)
  toastText.value = text
  toastAction.value = opts.action ? { label: opts.action, fn: opts.fn } : null
  pendingDone = opts.onTimeout || null
  timer = setTimeout(finish, opts.ms || (opts.action ? 6000 : 2200))
}

export function runToastAction() {
  const a = toastAction.value
  pendingDone = null // anularea înseamnă că nu mai facem pasul final (ex. ștergerea pozei bonului)
  clearTimeout(timer)
  toastText.value = ''
  toastAction.value = null
  a?.fn?.()
}
