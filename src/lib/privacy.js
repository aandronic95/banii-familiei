// Mod discret: ascunde sumele pe ecran (setare pe acest telefon)
import { ref } from 'vue'

const KEY = 'bf-private'
export const privacy = ref((() => { try { return localStorage.getItem(KEY) === '1' } catch (_) { return false } })())

export function togglePrivacy() {
  privacy.value = !privacy.value
  try { privacy.value ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY) } catch (_) {}
}
