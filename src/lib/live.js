// Ceas comun pentru cifrele „vii”: bate o dată pe secundă, doar cât aplicația e pe ecran
import { ref } from 'vue'

export const nowMs = ref(Date.now())
const tick = () => { nowMs.value = Date.now() }
setInterval(() => { if (document.visibilityState !== 'hidden') tick() }, 1000)
document.addEventListener('visibilitychange', tick)
