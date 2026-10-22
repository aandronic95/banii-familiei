<script setup>
import { onMounted, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, start, refreshIfStale } from './store.js'
import { tg, initTelegram, setBack, setChrome, BOT_USERNAME } from './lib/telegram.js'
import { isLockEnabled, authenticate, bioState, openBioSettings, lockSupported } from './lib/biometric.js'
import { t, lang } from './lib/i18n.js'
import TabBar from './components/TabBar.vue'
import { toastText } from './components/Toast.js'

const route = useRoute()
const router = useRouter()
const theme = ref('light')

// Blocare cu Face ID: la deschidere și după 2 minute în fundal
const locked = ref(lockSupported() && isLockEnabled())
const lockMsg = ref('')
let hiddenAt = 0
async function unlock() {
  lockMsg.value = ''
  const st = await bioState()
  if (!st.available || !st.granted) { lockMsg.value = t('lockDenied'); return }
  if (await authenticate(t('lockPrompt'))) locked.value = false
}
function relockCheck() {
  if (lockSupported() && isLockEnabled() && hiddenAt && Date.now() - hiddenAt > 120000) { locked.value = true; unlock() }
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
  if (locked.value) unlock()
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
    <div>
      <div class="bf-row__icon" style="width: 64px; height: 64px; border-radius: 20px;"><svg class="bf-icon" viewBox="0 0 24 24" style="width: 30px; height: 30px;" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
      <h1 class="h-title">{{ t('lockLocked') }}</h1>
      <p v-if="lockMsg" class="muted">{{ lockMsg }}</p>
      <button class="bf-btn bf-btn--primary" @click="unlock">{{ t('lockRetry') }}</button>
      <button v-if="lockMsg" class="link" @click="openBioSettings">{{ t('lockTitle') }} ›</button>
    </div>
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
