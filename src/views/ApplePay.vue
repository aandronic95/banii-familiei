<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, me, isOwner, memberById } from '../store.js'
import { supabase, SUPABASE_URL } from '../lib/supabase.js'
import { t } from '../lib/i18n.js'
import { dateShort } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const URL_WALLET = `${SUPABASE_URL}/functions/v1/wallet`
const devices = ref([])
const deviceName = ref('iPhone ' + (me.value?.name || ''))
const newToken = ref('')
const busy = ref(false)
const cards = computed(() => S.accounts.filter((a) => a.type === 'card' && !a.archived))

async function load() {
  const { data } = await supabase.from('device_tokens').select('id, name, member_id, user_id, created_at, last_used_at').order('created_at')
  devices.value = data || []
}
load()

function randomToken(n = 40) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const a = crypto.getRandomValues(new Uint8Array(n))
  return [...a].map((x) => abc[x % abc.length]).join('')
}
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

async function createKey() {
  if (busy.value || !me.value) return
  busy.value = true
  try {
    const token = randomToken()
    const { error } = await supabase.from('device_tokens').insert({
      family_id: S.family.id, member_id: me.value.id, user_id: S.userId,
      name: deviceName.value.trim() || 'iPhone', token_hash: await sha256(token),
    })
    if (error) throw error
    newToken.value = token
    haptic('success')
    load()
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = false }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); haptic('light') } catch (_) { toast(text) }
}
async function revoke(d) {
  if (!(await confirmDialog(t('apRevokeQ', d.name)))) return
  const { error } = await supabase.from('device_tokens').delete().eq('id', d.id)
  if (error) { toast(t('error', error)); return }
  devices.value = devices.value.filter((x) => x.id !== d.id)
}
const canRevoke = (d) => d.user_id === S.userId || isOwner.value
</script>

<template>
  <main class="page">
    <div>
      <h1 class="h-title">{{ t('apTitle') }}</h1>
      <p class="muted" style="margin: 4px 0 0; font: 500 14px/20px var(--font-sans);">{{ t('apIntro') }}</p>
    </div>

    <section class="bf-card stack">
      <h2 class="h-sec">{{ t('apStep1') }}</h2>
      <template v-if="!newToken">
        <div class="fld"><label for="ap-n">{{ t('apDeviceName') }}</label><input id="ap-n" v-model="deviceName" class="inp" maxlength="30"></div>
        <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="createKey"><Icon name="lock" />{{ t('apCreateKey') }}</button>
      </template>
      <template v-else>
        <p class="hint" style="margin: 0;">{{ t('apKeyOnce') }}</p>
        <div class="kv"><span class="muted">{{ t('apKey') }}</span></div>
        <div class="inp mono" style="display: flex; align-items: center; user-select: all; overflow-wrap: anywhere; font-size: 13px;">{{ newToken }}</div>
        <button type="button" class="bf-btn bf-btn--secondary" @click="copy(newToken)">{{ t('apCopyKey') }}</button>
      </template>
    </section>

    <section class="bf-card stack">
      <h2 class="h-sec">{{ t('apStep2') }}</h2>
      <ol class="ap-steps">
        <li v-html="t('apS1')"></li>
        <li v-html="t('apS2')"></li>
        <li v-html="t('apS3')"></li>
        <li>
          <span v-html="t('apS4')"></span>
          <div class="inp mono" style="display: flex; align-items: center; margin-top: 8px; font-size: 12px; overflow-wrap: anywhere; user-select: all;">{{ URL_WALLET }}</div>
          <button type="button" class="link" @click="copy(URL_WALLET)">{{ t('copyLink') }}</button>
        </li>
        <li>
          <span v-html="t('apS5')"></span>
          <table class="sched" style="margin-top: 8px;">
            <thead><tr><th>{{ t('apKeyCol') }}</th><th style="text-align: left;">{{ t('apValueCol') }}</th></tr></thead>
            <tbody>
              <tr><td class="mono" style="white-space: nowrap; padding-right: 12px; vertical-align: top;">token</td><td style="text-align: left;">{{ t('apVToken') }}</td></tr>
              <tr><td class="mono" style="white-space: nowrap; padding-right: 12px; vertical-align: top;">amount</td><td style="text-align: left;" v-html="t('apVAmount')"></td></tr>
              <tr><td class="mono" style="white-space: nowrap; padding-right: 12px; vertical-align: top;">merchant</td><td style="text-align: left;" v-html="t('apVMerchant')"></td></tr>
              <tr><td class="mono" style="white-space: nowrap; padding-right: 12px; vertical-align: top;">card</td><td style="text-align: left;" v-html="t('apVCard')"></td></tr>
            </tbody>
          </table>
        </li>
        <li v-html="t('apS6')"></li>
      </ol>
      <p class="hint" style="margin: 0;">{{ t('apTest') }}</p>
    </section>

    <section v-if="cards.length" class="stack">
      <div class="bf-list__head" style="padding-bottom: 0;">{{ t('apCards') }}</div>
      <p class="hint" style="margin: 0;">{{ t('apCardsHint') }}</p>
      <div class="bf-list">
        <button v-for="a in cards" :key="a.id" type="button" class="bf-row bf-row--tap" @click="router.push('/account/' + a.id)">
          <div class="bf-row__icon"><Icon name="card" /></div>
          <div class="bf-row__body">
            <div class="bf-row__title">{{ a.name }}</div>
            <div class="bf-row__sub">{{ a.wallet_alias ? t('apAlias', a.wallet_alias) : a.last4 ? '•• ' + a.last4 : t('apNoAlias') }}</div>
          </div>
          <span class="chev" aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <section v-if="devices.length" class="stack">
      <div class="bf-list__head" style="padding-bottom: 0;">{{ t('apDevices') }}</div>
      <div class="bf-list">
        <div v-for="d in devices" :key="d.id" class="bf-row">
          <div class="bf-row__icon"><Icon name="lock" /></div>
          <div class="bf-row__body">
            <div class="bf-row__title">{{ d.name }}</div>
            <div class="bf-row__sub">{{ memberById(d.member_id)?.name }} · {{ d.last_used_at ? t('apLastUsed', dateShort(d.last_used_at.slice(0, 10))) : t('apNeverUsed') }}</div>
          </div>
          <button v-if="canRevoke(d)" type="button" class="link" style="color: var(--danger);" :aria-label="t('apRevoke') + ' ' + d.name" @click="revoke(d)"><Icon name="trash" :size="18" /></button>
        </div>
      </div>
    </section>

    <div class="cap" style="display: flex; gap: 6px; align-items: flex-start;">
      <Icon name="lock" :size="16" />
      <span>{{ t('apSecurity') }}</span>
    </div>
  </main>
</template>
