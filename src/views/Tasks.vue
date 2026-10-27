<script setup>
// Sarcinile familiei și lista de cumpărături
import { ref, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, me, memberById, save, remove, completeTask, reopenTask, addShopping, notifyTask, accountById } from '../store.js'
import { t } from '../lib/i18n.js'
import { money, money0, todayISO, dateShort } from '../lib/format.js'
import { parseTask } from '../lib/taskparse.js'
import { haptic, confirmDialog } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const tab = ref(route.query.tab === 'shopping' ? 'shopping' : 'tasks')
const filter = ref((() => { try { return localStorage.getItem('bf-tasks-filter') || 'all' } catch (_) { return 'all' } })())
function setFilter(f) { filter.value = f; try { localStorage.setItem('bf-tasks-filter', f) } catch (_) {} }
const today = todayISO()
const addDays = (k) => new Date(Date.parse(today) + k * 86400000).toISOString().slice(0, 10)

// ── Sarcini ──
const quick = ref('')
const busy = ref('')
const adults = computed(() => S.members)
const mine = (x) => !x.assignee_id || x.assignee_id === me.value?.id
const open = computed(() => S.tasks.filter((x) => !x.done && (filter.value !== 'mine' || mine(x))))
const groups = computed(() => {
  const g = [
    { key: 'over', title: t('tgOver'), items: [], danger: true },
    { key: 'today', title: t('tgToday'), items: [] },
    { key: 'tomorrow', title: t('tgTomorrow'), items: [] },
    { key: 'week', title: t('tgWeek'), items: [] },
    { key: 'later', title: t('tgLater'), items: [] },
    { key: 'none', title: t('tgNoDate'), items: [] },
  ]
  const wk = addDays(7)
  for (const x of open.value) {
    const d = x.due_date
    const k = !d ? 'none' : d < today ? 'over' : d === today ? 'today' : d === addDays(1) ? 'tomorrow' : d <= wk ? 'week' : 'later'
    g.find((y) => y.key === k).items.push(x)
  }
  for (const y of g) y.items.sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9') || String(a.due_time || '99').localeCompare(String(b.due_time || '99')) || (b.created_at || '').localeCompare(a.created_at || ''))
  return g.filter((y) => y.items.length)
})
const done = computed(() => S.tasks.filter((x) => x.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 40))
const commentsOf = (id) => S.taskComments.filter((c) => c.task_id === id).length

function sub(x) {
  const bits = []
  if (x.due_date) bits.push((x.due_date === today ? t('today') : x.due_date === addDays(1) ? t('tomorrow') : dateShort(x.due_date)) + (x.due_time ? ' ' + String(x.due_time).slice(0, 5) : ''))
  if (x.repeat && x.repeat !== 'none') bits.push('🔁 ' + t('rep_' + x.repeat))
  const steps = x.steps || []
  if (steps.length) bits.push(`☑ ${steps.filter((s) => s.done).length}/${steps.length}`)
  const c = commentsOf(x.id)
  if (c) bits.push(`💬 ${c}`)
  return bits.join(' · ')
}
const who = (x) => memberById(x.assignee_id)

async function addQuick() {
  const txt = quick.value.trim()
  if (!txt) return
  const p = parseTask(txt, { today, members: S.members })
  if (p?.kind === 'shopping') { const n = await addShopping(txt); quick.value = ''; toast(t('shopAddedN', n)); tab.value = 'shopping'; return }
  if (!p) return
  busy.value = 'quick'
  try {
    const row = await save('tasks', {
      title: p.title, kind: p.money ? 'money' : 'task', assignee_id: p.assignee_id, due_date: p.due_date ?? (p.repeat !== 'none' ? today : null),
      due_time: p.due_time, repeat: p.repeat, amount: p.amount,
    })
    quick.value = ''
    haptic('success')
    if (row.assignee_id && row.assignee_id !== me.value?.id) notifyTask(row.id, 'assigned')
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = '' }
}

// Bifă: la sarcinile cu bani deschide cheltuiala (precompletată), la celelalte bifează direct
async function check(x) {
  if (x.kind === 'money') {
    router.push({ path: '/tx/new', query: { task: x.id } })
    return
  }
  busy.value = x.id
  try {
    const next = await completeTask(x)
    haptic('success')
    toast(next ? t('taskDoneNext', dateShort(next.due_date)) : t('taskDone'), { action: t('undo'), fn: async () => { await reopenTask(x); if (next) await remove('tasks', next.id, { silent: true }) } })
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = '' }
}

// ── Cumpărături ──
const shopIn = ref('')
const shopInput = ref(null)
const shopOpen = computed(() => S.shopping.filter((x) => !x.done).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')))
const shopDone = computed(() => S.shopping.filter((x) => x.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')))
const priced = computed(() => shopDone.value.reduce((s, x) => s + (Number(x.price) || 0), 0))
async function addShop() {
  const txt = shopIn.value.trim()
  if (!txt) return
  const n = await addShopping(txt)
  shopIn.value = ''
  haptic('light')
  if (n > 1) toast(t('shopAddedN', n))
  nextTick(() => shopInput.value?.focus())
}
async function toggleShop(x) {
  haptic('light')
  await save('shopping_items', { id: x.id, done: !x.done, done_at: x.done ? null : new Date().toISOString() })
}
async function setPrice(x, v) {
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  await save('shopping_items', { id: x.id, price: n > 0 ? Math.round(n * 100) / 100 : null })
}
async function clearDone() {
  if (!(await confirmDialog(t('shopClearQ', shopDone.value.length)))) return
  for (const x of shopDone.value) await remove('shopping_items', x.id, { silent: true })
}
function toExpense() { router.push({ path: '/tx/new', query: { shop: '1' } }) }
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('tasksTitle') }}</h1>
      <button v-if="tab === 'tasks'" type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/task/new')"><Icon name="plus" />{{ t('add') }}</button>
    </div>
    <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr));" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'tasks'" :class="{ on: tab === 'tasks' }" @click="tab = 'tasks'">{{ t('tasksTab') }}<span v-if="S.tasks.filter((x) => !x.done).length" class="cnt">{{ S.tasks.filter((x) => !x.done).length }}</span></button>
      <button type="button" role="tab" :aria-selected="tab === 'shopping'" :class="{ on: tab === 'shopping' }" @click="tab = 'shopping'">{{ t('shopTab') }}<span v-if="shopOpen.length" class="cnt">{{ shopOpen.length }}</span></button>
    </div>

    <template v-if="tab === 'tasks'">
      <form class="qadd" @submit.prevent="addQuick">
        <input v-model="quick" class="inp" :placeholder="t('taskQuickPh')" enterkeyhint="done" maxlength="160" :aria-label="t('taskQuickPh')">
        <button type="submit" class="bf-btn bf-btn--primary" :disabled="!quick.trim() || busy === 'quick'" :aria-label="t('add')"><Icon name="plus" /></button>
      </form>
      <p class="hint" style="margin: -6px 0 0;">{{ t('taskQuickHint') }}</p>

      <div class="bf-chips">
        <button v-for="f in ['all', 'mine', 'done']" :key="f" type="button" class="bf-chip" :class="{ 'bf-chip--on': filter === f }" @click="setFilter(f)">{{ t('tf_' + f) }}</button>
      </div>

      <template v-if="filter !== 'done'">
        <div v-if="!groups.length" class="bf-card empty">{{ t('tasksEmpty') }}</div>
        <section v-for="g in groups" :key="g.key">
          <div class="bf-list__head" :style="g.danger ? 'color: var(--danger);' : ''">{{ g.title }} · {{ g.items.length }}</div>
          <div class="bf-list">
            <div v-for="x in g.items" :key="x.id" class="bf-row task-row">
              <button type="button" class="tick" :class="{ 'tick--money': x.kind === 'money' }" :disabled="busy === x.id" :aria-label="t('taskMarkDone', x.title)" @click="check(x)"><Icon v-if="x.kind === 'money'" name="cash" :size="14" /></button>
              <button type="button" class="bf-row__body" style="all: unset; flex: 1; min-width: 0; cursor: pointer;" @click="router.push('/task/' + x.id)">
                <div class="bf-row__title">{{ x.title }}</div>
                <div class="bf-row__sub"><span v-if="who(x)" :class="`bf-dot bf-p${who(x).color}`"></span>{{ who(x) ? who(x).name + (sub(x) ? ' · ' : '') : '' }}{{ sub(x) }}</div>
              </button>
              <div v-if="x.amount" class="bf-row__amount" style="font-size: 14px;">{{ money0(x.amount) }}<small>{{ accountById(x.account_id)?.currency || 'MDL' }}</small></div>
            </div>
          </div>
        </section>
      </template>
      <template v-else>
        <div v-if="!done.length" class="bf-card empty">{{ t('tasksNoneDone') }}</div>
        <div v-else class="bf-list">
          <div v-for="x in done" :key="x.id" class="bf-row task-row" style="opacity: .7;">
            <button type="button" class="tick tick--on" :aria-label="t('taskReopen', x.title)" @click="reopenTask(x)"><Icon name="tick" :size="14" /></button>
            <button type="button" class="bf-row__body" style="all: unset; flex: 1; min-width: 0; cursor: pointer;" @click="router.push('/task/' + x.id)">
              <div class="bf-row__title" style="text-decoration: line-through;">{{ x.title }}</div>
              <div class="bf-row__sub">{{ memberById(x.done_by)?.name || '' }}{{ x.done_at ? ' · ' + dateShort(x.done_at.slice(0, 10)) : '' }}{{ x.tx_id ? ' · ' + t('taskHasTx') : '' }}</div>
            </button>
          </div>
        </div>
      </template>
    </template>

    <template v-else>
      <form class="qadd" @submit.prevent="addShop">
        <input ref="shopInput" v-model="shopIn" class="inp" :placeholder="t('shopPh')" enterkeyhint="done" maxlength="300" :aria-label="t('shopPh')">
        <button type="submit" class="bf-btn bf-btn--primary" :disabled="!shopIn.trim()" :aria-label="t('add')"><Icon name="plus" /></button>
      </form>
      <div v-if="!shopOpen.length && !shopDone.length" class="bf-card empty">{{ t('shopEmpty') }}</div>
      <div v-if="shopOpen.length" class="bf-list">
        <button v-for="x in shopOpen" :key="x.id" type="button" class="bf-row bf-row--tap task-row" @click="toggleShop(x)">
          <span class="tick" aria-hidden="true"></span>
          <div class="bf-row__body"><div class="bf-row__title">{{ x.name }}</div></div>
          <span v-if="x.qty" class="bf-chip" style="min-height: 26px; padding: 0 10px; font-size: 13px;">{{ x.qty }}</span>
        </button>
      </div>
      <template v-if="shopDone.length">
        <div class="bf-list__head">{{ t('shopBought', shopDone.length) }}</div>
        <div class="bf-list">
          <div v-for="x in shopDone" :key="x.id" class="bf-row task-row">
            <button type="button" class="tick tick--on" :aria-label="t('shopUndo', x.name)" @click="toggleShop(x)"><Icon name="tick" :size="14" /></button>
            <div class="bf-row__body"><div class="bf-row__title" style="text-decoration: line-through; opacity: .7;">{{ x.name }}<span v-if="x.qty" class="cap"> · {{ x.qty }}</span></div></div>
            <input class="inp" style="width: 92px; min-height: 36px; text-align: right; padding: 0 10px;" inputmode="decimal" :value="x.price ? String(x.price).replace('.', ',') : ''" :placeholder="t('shopPrice')" :aria-label="t('shopPrice') + ' ' + x.name" @change="setPrice(x, $event.target.value)">
          </div>
        </div>
        <div class="bf-card stack" style="padding: 12px 16px;">
          <button type="button" class="bf-btn bf-btn--primary bf-btn--block" @click="toExpense"><Icon name="cash" />{{ priced ? t('shopToExpenseSum', money(priced)) : t('shopToExpense') }}</button>
          <button type="button" class="link" style="align-self: center; padding: 0;" @click="clearDone">{{ t('shopClear') }}</button>
        </div>
      </template>
      <p class="hint">{{ t('shopHint') }}</p>
    </template>
  </main>
</template>
