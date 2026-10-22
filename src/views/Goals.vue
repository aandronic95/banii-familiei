<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { S, save, goalProgress, memberById, accountById } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, dateLong, todayISO } from '../lib/format.js'
import { haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const busy = ref(false)
const goals = computed(() => [...S.goals].sort((a, b) => Number(a.done) - Number(b.done) || (a.deadline || '9999').localeCompare(b.deadline || '9999')))
const kids = computed(() => S.members.filter((m) => m.kind === 'child'))
const kidsWithout = computed(() => kids.value.filter((k) => !S.goals.some((g) => g.member_id === k.id)))

function monthsLeft(deadline) {
  if (!deadline) return null
  const [y1, m1] = todayISO().split('-').map(Number)
  const [y2, m2] = deadline.split('-').map(Number)
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1))
}
function monthly(g) {
  const p = goalProgress(g)
  const n = monthsLeft(g.deadline)
  return n && p.left > 0 ? p.left / n : null
}

// Pușculița copilului: un cont de economii pe numele lui + obiectiv legat de el
async function createPiggy(kid) {
  if (busy.value) return
  busy.value = true
  try {
    const acc = await save('accounts', { name: t('kidName', kid.name), type: 'deposit', currency: 'MDL', member_id: kid.id, opening_balance: 0, sort: S.accounts.length + 1 })
    const g = await save('goals', { name: t('kidName', kid.name), target: 10000, currency: 'MDL', account_id: acc.id, member_id: kid.id, icon: 'school' })
    haptic('success'); toast(t('saved'))
    router.push('/goal/' + g.id)
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = false }
}
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('goalsTitle') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/goal/new')"><Icon name="plus" />{{ t('add') }}</button>
    </div>

    <div v-for="k in kidsWithout" :key="k.id" class="bf-card stack">
      <div class="sec-head">
        <div>
          <h2 class="h-sec">{{ t('kidPiggy') }}</h2>
          <div class="cap">{{ t('kidPiggySub') }}</div>
        </div>
        <span class="av" :style="{ boxShadow: `inset 0 0 0 2px var(--person-${k.color})` }">{{ k.name.slice(0, 1).toUpperCase() }}</span>
      </div>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="createPiggy(k)"><Icon name="piggy" />{{ t('kidCreate') }}</button>
    </div>

    <div v-if="!goals.length && !kidsWithout.length" class="bf-card empty stack">
      <span>{{ t('noGoals') }}</span>
      <button type="button" class="bf-btn bf-btn--primary" @click="router.push('/goal/new')">{{ t('newGoal') }}</button>
    </div>

    <button v-for="g in goals" :key="g.id" type="button" class="bf-card stack" style="border: 0; text-align: left; color: inherit; cursor: pointer;" :style="{ opacity: g.done ? 0.6 : 1 }" @click="router.push('/goal/' + g.id)">
      <div class="sec-head" style="align-items: flex-start;">
        <div style="display: flex; gap: 12px; align-items: center;">
          <div class="bf-row__icon"><Icon :name="g.icon || 'piggy'" /></div>
          <div>
            <div class="h-sec">{{ g.name }}</div>
            <div class="cap">{{ [memberById(g.member_id)?.name, g.deadline ? t('goalDeadline') + ' ' + dateLong(g.deadline) : null, accountById(g.account_id)?.name].filter(Boolean).join(' · ') }}</div>
          </div>
        </div>
        <span class="bf-budget__nums">{{ Math.round(goalProgress(g).pct * 100) }}%</span>
      </div>
      <div class="bf-bar" style="height: 10px;"><i :style="{ width: goalProgress(g).pct * 100 + '%' }"></i></div>
      <div class="kv"><span class="muted">{{ money0(goalProgress(g).saved) }} / {{ money0(g.target) }} {{ g.currency }}</span>
        <b v-if="goalProgress(g).pct >= 1" class="bf-income">{{ t('goalReached') }}</b>
        <b v-else-if="monthly(g)" class="muted" style="font-weight: 500;">{{ t('goalMonthly', money0(monthly(g)) + ' ' + g.currency) }}</b>
      </div>
    </button>
  </main>
</template>
