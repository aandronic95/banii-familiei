<script setup>
// Plățile în calendarul telefonului: abonament .ics (Google Calendar, iPhone) cu link secret al familiei
import { ref, computed, onMounted } from 'vue'
import { S } from '../store.js'
import { supabase, SUPABASE_URL } from '../lib/supabase.js'
import { t } from '../lib/i18n.js'
import { openLink, haptic, confirmDialog } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const token = ref(S.family?.ics_token || '')
const busy = ref(false)
const url = computed(() => (token.value ? `${SUPABASE_URL}/functions/v1/ics?k=${token.value}` : ''))
const webcal = computed(() => url.value.replace(/^https?:/, 'webcal:'))
async function make(reset = false) {
  if (S.demo) { toast(t('demoBar')); return }
  if (reset && !(await confirmDialog(t('icsResetQ')))) return
  busy.value = true
  try {
    const { data, error } = await supabase.rpc('ics_token', { reset })
    if (error) throw error
    token.value = data
    if (S.family) S.family.ics_token = data
    haptic('success')
    if (reset) toast(t('icsResetDone'))
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = false }
}
const google = () => openLink('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal.value))
// Telegram deschide doar https: o pagină mică a aplicației trimite mai departe la webcal:// (abonarea pe iPhone)
const apple = () => openLink(new URL('ics.html?u=' + encodeURIComponent(webcal.value), location.origin + import.meta.env.BASE_URL).href)
async function copy() {
  try { await navigator.clipboard.writeText(url.value); toast(t('copied')) } catch (_) { toast(url.value) }
}
onMounted(() => { if (!token.value) make(false) })
</script>

<template>
  <main class="page">
    <h1 class="h-title">{{ t('icsTitle') }}</h1>
    <p class="hint" style="margin: 0;">{{ t('icsIntro') }}</p>
    <div class="bf-card stack">
      <button type="button" class="bf-btn bf-btn--primary" :disabled="!url || busy" @click="google"><Icon name="clock" />{{ t('icsGoogle') }}</button>
      <button type="button" class="bf-btn bf-btn--secondary" :disabled="!url || busy" @click="apple">{{ t('icsApple') }}</button>
      <button type="button" class="bf-btn bf-btn--secondary" :disabled="!url || busy" @click="copy">{{ t('icsCopy') }}</button>
      <p class="hint" style="margin: 0;">{{ t('icsHow') }}</p>
    </div>
    <div class="bf-card stack">
      <b>{{ t('icsWhat') }}</b>
      <ul style="margin: 0; padding-left: 20px; display: grid; gap: 4px;">
        <li v-for="k in ['icsW1', 'icsW2', 'icsW3', 'icsW4', 'icsW5']" :key="k">{{ t(k) }}</li>
      </ul>
    </div>
    <div class="bf-card stack">
      <p class="hint" style="margin: 0;">{{ t('icsSecret') }}</p>
      <button type="button" class="link" style="padding: 0; justify-self: start; color: var(--danger);" :disabled="busy" @click="make(true)">{{ t('icsReset') }}</button>
    </div>
  </main>
</template>
