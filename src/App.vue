<script setup>
import { onMounted, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, start, refreshIfStale } from './store.js'
import { tg, initTelegram, setBack, setChrome, BOT_USERNAME } from './lib/telegram.js'
import { authenticate, bioState } from './lib/biometric.js'
import { isLockEnabled, isBioEnabled, setLockEnabled, pinVerify, pinForgot, pinReset } from './lib/lock.js'
import PinPad from './components/PinPad.vue'
import { t, lang } from './lib/i18n.js'
import TabBar from './components/TabBar.vue'
import { toast } from './components/Toast.js'
import { toastText } from './components/Toast.js'

const route = useRoute()
const router = useRouter()
const theme = ref('light')

// Blocare: Face ID (dacă e pornit și merge) sau codul de rezervă, verificat pe server.
// Se cere la deschidere și după 2 minute în fundal.
const locked = ref(isLockEnabled())
const lockErr = ref('')
const lockBusy = ref(false)
const bioOk = ref(false)
const resetMode = ref(false)
let hiddenAt = 0
async function tryBio() {
  if (!isBioEnabled()) return
  const st = await bioState()
  bioOk.value = st.available && st.granted
  if (bioOk.value && (await authenticate(t('lockPrompt')))) { locked.value = false; lockErr.value = '' }
}
async function tryPin(pin) {
  lockBusy.value = true
  lockErr.value = ''
  try {
    if (resetMode.value) {
      const r = await pinReset(pin)
      if (r.ok) { setLockEnabled(false); locked.value = false; resetMode.value = false; toast(t('pinResetDone')); return }
      lockErr.value = r.error === 'expired' ? t('pinExpired') : r.error === 'network' ? t('pinNetwork') : t('pinWrong', 0)
      return
    }
    const r = await pinVerify(pin)
    if (r.ok) { locked.value = false; return }
    if (r.error === 'no_pin') { setLockEnabled(false); locked.value = false; return } // codul a fost șters de pe alt telefon
    lockErr.value = r.error === 'locked' ? t('pinLockedFor', r.retryIn) : r.error === 'network' ? t('pinNetwork') : t('pinWrong', r.left)
  } finally { lockBusy.value = false }
}
async function forgot() {
  const r = await pinForgot()
  if (r.ok) { resetMode.value = true; lockErr.value = ''; toast(t('pinForgotSent')) }
  else lockErr.value = t('pinNetwork')
}
function relockCheck() {
  if (isLockEnabled() && hiddenAt && Date.now() - hiddenAt > 120000) { locked.value = true; resetMode.value = false; tryBio() }
  hiddenAt = 0
}

function applyTheme(th) {
  theme.value = th
  document.documentElement.dataset.theme = th
  setChrome(th === 'dark' ? '#0e1311' : '#f3f4f1')
}

onMounted(() => {
  document.documentElement.lang = lang.value
  initTelegram(applyTheme)
  start()
  // Datele se reîncarcă când aplicația revine din fundal
  if (locked.value) tryBio()
  tg?.onEvent?.('activated', () => { relockCheck(); refreshIfStale() })
  tg?.onEvent?.('deactivated', () => { hiddenAt = Date.now() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now()
    else { relockCheck(); refreshIfStale() }
  })
})

// Link direct la o tranzacție (butonul „Modifică” din mesajul botului)
const deepTx = new URLSearchParams(location.search).get('tx')
watch(() => S.status, (st) => {
  if (st === 'ready' && deepTx && /^[0-9a-f-]{36}$/i.test(deepTx)) {
    history.replaceState(null, '', location.pathname)
    router.push('/tx/' + deepTx)
  }
})

watch(() => [route.fullPath, S.status], () => {
  const root = route.meta.tab
  setBack(!root && S.status === 'ready', () => router.back())
  // Pe formulare, Telegram cere confirmare înainte de închidere, ca să nu se piardă ce ai scris
  try { route.meta.form ? tg?.enableClosingConfirmation?.() : tg?.disableClosingConfirmation?.() } catch (_) {}
}, { immediate: true })
</script>

<template>
  <div v-if="locked" class="gate">
    <PinPad :title="resetMode ? t('pinResetTitle') : t('lockLocked')" :sub="resetMode ? t('pinForgotSent') : ''" :length="resetMode ? 6 : 4"
            :error="lockErr" :busy="lockBusy" :show-bio="bioOk && !resetMode" :show-forgot="!resetMode" @done="tryPin" @bio="tryBio" @forgot="forgot" />
  </div>

  <div v-else-if="S.status === 'loading'" class="gate"><div><div class="spinner" role="status" :aria-label="t('loading')"></div></div></div>

  <div v-else-if="S.status === 'not_telegram'" class="gate">
    <div>
      <h1 class="h-title">{{ t('openInTelegram') }}</h1>
      <p class="muted">{{ t('openInTelegramText') }}</p>
      <a class="bf-btn bf-btn--primary" :href="`https://t.me/${BOT_USERNAME}`">{{ t('openBot') }}</a>
    </div>
  </div>

  <div v-else-if="S.status === 'not_allowed'" class="gate">
    <div>
      <h1 class="h-title">{{ t('notAllowed') }}</h1>
      <p class="muted">{{ t('notAllowedText') }}</p>
      <div class="bf-card" style="width: 100%;">
        <div class="bf-balance__label">{{ t('yourId') }}</div>
        <div class="bf-balance__amount" style="font-size: 26px; user-select: all;">{{ S.tgId }}</div>
      </div>
    </div>
  </div>

  <div v-else-if="S.status === 'invite_bad'" class="gate">
    <div>
      <h1 class="h-title">{{ t('inviteBad') }}</h1>
      <p class="muted">{{ t('inviteBadText') }}</p>
    </div>
  </div>

  <div v-else-if="S.status === 'error'" class="gate">
    <div>
      <p class="muted">{{ t('error', S.errorText) }}</p>
      <button class="bf-btn bf-btn--primary" @click="start">{{ t('retry') }}</button>
    </div>
  </div>

  <template v-else>
    <router-view v-slot="{ Component }">
      <component :is="Component" :key="route.fullPath" />
    </router-view>
    <TabBar v-if="!route.meta.form" />
    <div v-if="toastText" class="toast" role="status">{{ toastText }}</div>
  </template>
</template>
