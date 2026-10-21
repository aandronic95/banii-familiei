<script setup>
import { ref } from 'vue'
import { S, me, isOwner, save, remove } from '../store.js'
import { supabase } from '../lib/supabase.js'
import { t } from '../lib/i18n.js'
import { BOT_USERNAME, shareLink, confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const inviteName = ref('')
const inviteLink = ref('')
const newPerson = ref('')
const busy = ref(false)

const roleLabel = (m) => (m.role === 'owner' ? t('ownerRole') : m.role === 'editor' ? t('fullAccess') : t('personOnly'))
const subLabel = (m) => (m.role === 'none' ? t('noAccess') : m.id === me.value?.id ? t('you') : 'Telegram')

function randomCode(n = 16) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const a = crypto.getRandomValues(new Uint8Array(n))
  return [...a].map((x) => abc[x % abc.length]).join('')
}

async function createInvite() {
  if (busy.value) return
  busy.value = true
  try {
    const code = randomCode()
    const { error } = await supabase.from('invites').insert({ code, family_id: S.family.id, created_by: S.userId, member_name: inviteName.value.trim() || 'Soția' })
    if (error) throw error
    inviteLink.value = `https://t.me/${BOT_USERNAME}?start=inv_${code}`
    haptic('success')
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = false }
}
function share() { shareLink(inviteLink.value, t('inviteText')) }
async function copy() {
  try { await navigator.clipboard.writeText(inviteLink.value); toast(t('copied')) } catch (_) {}
}
async function revoke(m) {
  if (!(await confirmDialog(t('removeAccessQ', m.name)))) return
  try { await remove('members', m.id) } catch (e) { console.error(e); toast(t('error', e)) }
}
async function addPerson() {
  const name = newPerson.value.trim()
  if (!name) return
  try {
    await save('members', { name, kind: 'child', role: 'none', color: 3 })
    newPerson.value = ''
  } catch (e) { console.error(e); toast(t('error', e)) }
}
async function rename(m, ev) {
  const name = ev.target.value.trim()
  if (name && name !== m.name) await save('members', { id: m.id, name })
}
</script>

<template>
  <main class="page">
    <h1 class="h-title">{{ t('family') }}</h1>

    <div class="bf-list">
      <div v-for="m in S.members" :key="m.id" class="bf-row">
        <span class="av" :style="{ boxShadow: `inset 0 0 0 2px var(--person-${m.color})` }">{{ m.name.slice(0, 1).toUpperCase() }}</span>
        <div class="bf-row__body">
          <input :value="m.name" class="bf-row__title" style="border: 0; background: transparent; color: inherit; padding: 0; width: 100%; outline-offset: 2px;" :aria-label="t('name')" maxlength="30" @change="rename(m, $event)">
          <div class="bf-row__sub">{{ subLabel(m) }}</div>
        </div>
        <span class="role" :class="{ 'role--on': m.role === 'editor' }">{{ roleLabel(m) }}</span>
        <button v-if="isOwner && m.role !== 'owner'" type="button" class="link" style="color: var(--danger);" :aria-label="t('removeAccess') + ' ' + m.name" @click="revoke(m)"><Icon name="trash" :size="18" /></button>
      </div>
    </div>

    <section v-if="isOwner" class="bf-card stack">
      <h2 class="h-sec">{{ t('invite') }}</h2>
      <template v-if="!inviteLink">
        <div class="fld"><label for="inv-n">{{ t('inviteName') }}</label><input id="inv-n" v-model="inviteName" class="inp" placeholder="Soția" maxlength="30"></div>
        <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="createInvite"><Icon name="send" />{{ t('invite') }}</button>
      </template>
      <template v-else>
        <p class="hint" style="margin: 0;">{{ t('inviteCreated') }}</p>
        <div class="inp" style="display: flex; align-items: center; font-size: 13px; overflow-wrap: anywhere; user-select: all;">{{ inviteLink }}</div>
        <div class="grid2">
          <button type="button" class="bf-btn bf-btn--primary" @click="share"><Icon name="send" />Telegram</button>
          <button type="button" class="bf-btn bf-btn--secondary" @click="copy">{{ t('copyLink') }}</button>
        </div>
      </template>
    </section>

    <section v-if="isOwner" class="stack">
      <div class="bf-list__head" style="padding-bottom: 0;">{{ t('addPerson') }}</div>
      <div style="display: flex; gap: 8px;">
        <input v-model="newPerson" class="inp" :placeholder="t('name')" :aria-label="t('name')" maxlength="30" @keyup.enter="addPerson">
        <button type="button" class="bf-btn bf-btn--secondary" :aria-label="t('addPerson')" @click="addPerson"><Icon name="plus" /></button>
      </div>
    </section>

    <div class="cap" style="display: flex; gap: 6px; align-items: flex-start;">
      <Icon name="lock" :size="16" />
      <span>{{ t('security') }}</span>
    </div>
  </main>
</template>
