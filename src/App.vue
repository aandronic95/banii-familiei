<script setup>
import { onMounted, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, start } from './store.js'
import { initTelegram, setBack, setChrome, BOT_USERNAME } from './lib/telegram.js'
import { t, lang } from './lib/i18n.js'
import TabBar from './components/TabBar.vue'
import { toastText } from './components/Toast.js'

const route = useRoute()
const router = useRouter()
const theme = ref('light')

function applyTheme(th) {
  theme.value = th
  document.documentElement.dataset.theme = th
  setChrome(th === 'dark' ? '#0e1311' : '#f3f4f1')
}

onMounted(() => {
  document.documentElement.lang = lang.value
  initTelegram(applyTheme)
  start()
})

watch(() => [route.fullPath, S.status], () => {
  const root = route.meta.tab
  setBack(!root && S.status === 'ready', () => router.back())
}, { immediate: true })
</script>

<template>
  <div v-if="S.status === 'loading'" class="gate"><div><div class="spinner" role="status" :aria-label="t('loading')"></div></div></div>

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
      <p class="muted">{{ t('error') }}</p>
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
