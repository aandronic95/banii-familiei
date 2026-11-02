<script setup>
// Zile de naștere, aniversări și alte evenimente: câte zile au rămas, câți ani împlinește, buget de cadou
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, save, remove, upcomingEvents, memberById } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, parseAmount, dateLong, todayISO } from '../lib/format.js'
import { haptic, confirmDialog } from '../lib/telegram.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const KIND_ICON = { birthday: 'cake', anniversary: 'heart', holiday: 'star', other: 'calendar' }
const edit = ref(null)
function openEdit(e) {
  edit.value = e ? { id: e.id, title: e.title, kind: e.kind, date: e.date, has_year: e.has_year, yearly: e.yearly, member_id: e.member_id || '', gift_budget: e.gift_budget != null ? String(Number(e.gift_budget)) : '', remind_days: e.remind_days, note: e.note || '' }
    : { title: '', kind: 'birthday', date: '', has_year: true, yearly: true, member_id: '', gift_budget: '', remind_days: 7, note: '' }
}
async function saveEvent() {
  const e = edit.value
  if (!e.title.trim() || !e.date) return
  await save('events', { ...(e.id ? { id: e.id } : {}), title: e.title.trim().slice(0, 80), kind: e.kind, date: e.date, has_year: !!e.has_year, yearly: !!e.yearly,
    member_id: e.member_id || null, gift_budget: parseAmount(e.gift_budget) > 0 ? parseAmount(e.gift_budget) : null,
    remind_days: Math.min(60, Math.max(0, Number(e.remind_days) || 0)), note: e.note.trim() || null })
  edit.value = null
  haptic('success')
}
async function del() {
  if (!(await confirmDialog(t('evDeleteQ')))) return
  await remove('events', edit.value.id); edit.value = null
}
// Membrii familiei cu ziua de naștere încă neadăugată (ajutor la început)
const missing = computed(() => S.members.filter((m) => !S.events.some((e) => e.member_id === m.id && e.kind === 'birthday')))
function addFor(m) { openEdit(null); edit.value.title = m.name; edit.value.member_id = m.id }
function gift(e) { router.push({ path: '/tx/new', query: { amount: e.gift_budget ? String(e.gift_budget) : undefined, merchantText: t('evGiftFor', e.title), tag: 'cadouri' } }) }
const when = (e) => (e.inDays === 0 ? t('today') : e.inDays === 1 ? t('tomorrow') : t('inDays', e.inDays))
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('evTitle') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="openEdit(null)"><Icon name="plus" />{{ t('add') }}</button>
    </div>

    <div v-if="edit" class="bf-card stack">
      <div class="seg" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
        <button v-for="k in ['birthday', 'anniversary', 'holiday', 'other']" :key="k" type="button" :class="{ on: edit.kind === k }" @click="edit.kind = k">{{ t('ek_' + k) }}</button>
      </div>
      <div class="fld"><label for="e-t">{{ t('evWho') }}</label><input id="e-t" v-model="edit.title" class="inp" maxlength="80" :placeholder="t('evPh')"></div>
      <div class="grid2">
        <div class="fld"><label for="e-d">{{ t('date') }}</label><input id="e-d" v-model="edit.date" type="date" class="inp"></div>
        <div class="fld"><label for="e-g">{{ t('evGift') }}</label><input id="e-g" v-model="edit.gift_budget" class="inp" inputmode="decimal" :placeholder="t('optional')"></div>
      </div>
      <label class="kv" style="cursor: pointer;"><span>{{ t('evHasYear') }}</span><input v-model="edit.has_year" type="checkbox" class="sw"></label>
      <label class="kv" style="cursor: pointer;"><span>{{ t('evYearly') }}</span><input v-model="edit.yearly" type="checkbox" class="sw"></label>
      <div class="fld"><label for="e-r">{{ t('evRemind') }}</label><input id="e-r" v-model="edit.remind_days" type="number" min="0" max="60" class="inp"></div>
      <div class="fld"><span class="lbl">{{ t('evMember') }}</span>
        <div class="bf-chips">
          <button type="button" class="bf-chip" :class="{ 'bf-chip--on': !edit.member_id }" @click="edit.member_id = ''">{{ t('evOther') }}</button>
          <button v-for="m in S.members" :key="m.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': edit.member_id === m.id }" @click="edit.member_id = m.id"><span :class="`bf-dot bf-p${m.color}`"></span>{{ m.name }}</button>
        </div></div>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="bf-btn bf-btn--secondary" @click="edit = null">{{ t('cancel') }}</button>
        <button type="button" class="bf-btn bf-btn--primary" style="flex: 1;" :disabled="!edit.title.trim() || !edit.date" @click="saveEvent">{{ t('save') }}</button>
      </div>
      <button v-if="edit.id" type="button" class="link" style="align-self: center; padding: 0; color: var(--danger);" @click="del">{{ t('delete') }}</button>
    </div>

    <div v-if="!upcomingEvents.length && !edit" class="bf-card empty">{{ t('evEmpty') }}</div>
    <div v-if="upcomingEvents.length" class="bf-list">
      <button v-for="e in upcomingEvents" :key="e.id" type="button" class="bf-row bf-row--tap" @click="openEdit(e)">
        <div class="bf-row__icon" :style="e.inDays <= e.remind_days ? 'background: var(--warning-soft); color: var(--warning);' : ''"><Icon :name="KIND_ICON[e.kind]" /></div>
        <div class="bf-row__body">
          <div class="bf-row__title">{{ e.title }}<span v-if="e.turns" class="cap"> · {{ t('evTurns', e.turns) }}</span></div>
          <div class="bf-row__sub">{{ dateLong(e.next) }}<span v-if="e.gift_budget"> · 🎁 {{ money0(e.gift_budget) }} MDL</span></div>
        </div>
        <div class="bf-row__amount" style="font-size: 14px;" :class="{ 'bf-expense': e.inDays <= 3 }">{{ when(e) }}</div>
      </button>
    </div>
    <div v-for="e in upcomingEvents.filter((x) => x.inDays <= x.remind_days && x.gift_budget)" :key="'g' + e.id" class="bf-banner" style="background: var(--brand-soft);">
      <Icon name="gift" /><div style="flex: 1;">{{ t('evGiftSoon', e.title, money0(e.gift_budget)) }}</div>
      <button type="button" class="link" style="padding: 0;" @click="gift(e)">{{ t('evGiftBought') }}</button>
    </div>

    <section v-if="missing.length && !edit" class="stack">
      <div class="bf-list__head">{{ t('evMissing') }}</div>
      <div class="bf-chips"><button v-for="m in missing" :key="m.id" type="button" class="bf-chip" @click="addFor(m)"><Icon name="plus" :size="14" />{{ m.name }}</button></div>
    </section>
    <p class="hint">{{ t('evHint') }}</p>
  </main>
</template>
