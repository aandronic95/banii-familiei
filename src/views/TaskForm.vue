<script setup>
// O sarcină: titlu, cine, termen și oră, repetare, sumă (sarcină cu bani), pași, notă, comentarii
import { reactive, ref, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, me, save, remove, memberById, activeAccounts, completeTask, reopenTask, notifyTask } from '../store.js'
import { t, catName, lang } from '../lib/i18n.js'
import { parseAmount, todayISO, money, dateShort } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.tasks.find((x) => x.id === route.params.id)
if (!isNew && !orig) router.replace('/tasks')

const f = reactive({
  title: orig?.title ?? String(route.query.title || ''),
  kind: orig?.kind ?? 'task',
  assignee_id: orig?.assignee_id ?? '',
  due_date: orig?.due_date ?? '',
  due_time: orig?.due_time ? String(orig.due_time).slice(0, 5) : '',
  repeat: orig?.repeat ?? 'none',
  repeat_every: orig?.repeat_every ?? 1,
  amount: orig?.amount != null ? String(Number(orig.amount)).replace('.', ',') : '',
  category_id: orig?.category_id ?? '',
  account_id: orig?.account_id ?? '',
  note: orig?.note ?? '',
  steps: (orig?.steps || []).map((x) => ({ ...x })),
})
const busy = ref(false)
const err = ref('')
const cats = computed(() => S.categories.filter((c) => c.kind === 'expense' && !c.archived))
const today = todayISO()
const addDays = (k) => new Date(Date.parse(today) + k * 86400000).toISOString().slice(0, 10)

// Pași
const newStep = ref('')
const stepIn = ref(null)
function addStep() {
  const v = newStep.value.trim()
  if (!v || f.steps.length >= 50) return
  f.steps.push({ t: v.slice(0, 120), done: false })
  newStep.value = ''
  nextTick(() => stepIn.value?.focus())
}
const stepsDone = computed(() => f.steps.filter((x) => x.done).length)
// Bifarea unui pas pe o sarcină existentă se salvează imediat (o vede și celălalt)
async function toggleStep(i) {
  f.steps[i].done = !f.steps[i].done
  haptic('light')
  if (orig) await save('tasks', { id: orig.id, steps: f.steps.map((x) => ({ t: x.t, done: !!x.done })) }).catch(() => {})
}

function row() {
  return {
    ...(orig ? { id: orig.id } : {}),
    title: f.title.trim().slice(0, 120), kind: f.kind,
    assignee_id: f.assignee_id || null,
    due_date: f.due_date || (f.repeat !== 'none' ? today : null),
    due_time: f.due_date || f.repeat !== 'none' ? f.due_time || null : null,
    repeat: f.repeat, repeat_every: Math.min(12, Math.max(1, Number(f.repeat_every) || 1)),
    amount: f.kind === 'money' && parseAmount(f.amount) > 0 ? parseAmount(f.amount) : null,
    category_id: f.kind === 'money' ? f.category_id || null : null,
    account_id: f.kind === 'money' ? f.account_id || null : null,
    note: f.note.trim() || null,
    steps: f.steps.filter((x) => x.t.trim()).map((x) => ({ t: x.t.trim(), done: !!x.done })),
  }
}

async function submit() {
  err.value = ''
  if (!f.title.trim()) { err.value = t('taskTitleReq'); return }
  busy.value = true
  try {
    const saved = await save('tasks', row())
    const assignedOther = saved.assignee_id && saved.assignee_id !== me.value?.id && (isNew || saved.assignee_id !== orig.assignee_id)
    if (assignedOther) notifyTask(saved.id, 'assigned')
    haptic('success')
    if (!saved._pending) toast(t('saved'))
    router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}

// „Gata”: la sarcina cu bani se trece și cheltuiala
async function markDone() {
  if (!orig) return
  if (f.kind === 'money') {
    await save('tasks', row())
    router.replace({ path: '/tx/new', query: { task: orig.id } })
    return
  }
  busy.value = true
  try {
    await save('tasks', row())
    const next = await completeTask({ ...orig, ...row() })
    haptic('success')
    toast(next ? t('taskDoneNext', dateShort(next.due_date)) : t('taskDone'))
    router.back()
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}
async function reopen() { await reopenTask(orig); router.back() }
async function del() {
  if (!(await confirmDialog(t('taskDeleteQ')))) return
  await remove('tasks', orig.id)
  router.back()
}

// Comentarii
const comments = computed(() => (orig ? S.taskComments.filter((c) => c.task_id === orig.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')) : []))
const cIn = ref('')
async function sendComment() {
  const body = cIn.value.trim()
  if (!body || !orig) return
  try {
    const c = await save('task_comments', { task_id: orig.id, body: body.slice(0, 1000), member_id: me.value?.id || null })
    cIn.value = ''
    haptic('light')
    if (!c._pending) notifyTask(orig.id, 'comment', c.id)
  } catch (e) { console.error(e); toast(t('error', e)) }
}
const when = (iso) => (iso ? new Date(iso).toLocaleString(lang.value === 'ru' ? 'ru-RU' : 'ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
</script>

<template>
  <main class="page page--form">
    <h1 class="h-sec" style="text-align: center;">{{ isNew ? t('taskNew') : t('taskEdit') }}</h1>

    <div v-if="orig?.done" class="bf-banner" style="background: var(--brand-soft);">
      <Icon name="tick" /><div style="flex: 1;">{{ t('taskWasDone', memberById(orig.done_by)?.name || '—', orig.done_at ? dateShort(orig.done_at.slice(0, 10)) : '') }}</div>
      <button type="button" class="link" style="padding: 0;" @click="reopen">{{ t('taskReopenBtn') }}</button>
    </div>

    <div class="fld"><label for="t-title">{{ t('taskTitle') }}</label><input id="t-title" v-model="f.title" class="inp" maxlength="120" :placeholder="t('taskTitlePh')"></div>

    <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr));" role="group">
      <button type="button" :class="{ on: f.kind === 'task' }" @click="f.kind = 'task'">{{ t('taskKindTask') }}</button>
      <button type="button" :class="{ on: f.kind === 'money' }" @click="f.kind = 'money'">{{ t('taskKindMoney') }}</button>
    </div>

    <template v-if="f.kind === 'money'">
      <div class="grid2">
        <div class="fld"><label for="t-amt">{{ t('amount') }}</label><input id="t-amt" v-model="f.amount" class="inp" inputmode="decimal" placeholder="0"></div>
        <div class="fld"><label for="t-acc">{{ t('fromAccount') }}</label>
          <select id="t-acc" v-model="f.account_id" class="inp"><option value="">—</option><option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ a.name }}</option></select></div>
      </div>
      <div class="fld"><span class="lbl">{{ t('category') }}</span>
        <div class="bf-chips"><button v-for="c in cats" :key="c.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.category_id === c.id }" @click="f.category_id = f.category_id === c.id ? '' : c.id"><Icon :name="c.icon" :size="16" />{{ catName(c) }}</button></div>
      </div>
      <p class="hint" style="margin: -4px 0 0;">{{ t('taskMoneyHint') }}</p>
    </template>

    <div class="fld"><span class="lbl">{{ t('taskWho') }}</span>
      <div class="bf-chips">
        <button type="button" class="bf-chip" :class="{ 'bf-chip--on': !f.assignee_id }" @click="f.assignee_id = ''">{{ t('taskAnyone') }}</button>
        <button v-for="m in S.members" :key="m.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.assignee_id === m.id }" @click="f.assignee_id = m.id"><span :class="`bf-dot bf-p${m.color}`"></span>{{ m.name }}</button>
      </div>
    </div>

    <div class="fld"><span class="lbl">{{ t('taskDue') }}</span>
      <div class="bf-chips" style="margin-bottom: 8px;">
        <button v-for="[k, d] in [['today', today], ['tomorrow', addDays(1)], ['inWeek', addDays(7)]]" :key="k" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.due_date === d }" @click="f.due_date = d">{{ t(k === 'inWeek' ? 'taskInWeek' : k) }}</button>
        <button v-if="f.due_date" type="button" class="bf-chip" @click="f.due_date = ''; f.due_time = ''">{{ t('taskNoDate') }}</button>
      </div>
      <div class="grid2">
        <input v-model="f.due_date" type="date" class="inp" :aria-label="t('date')">
        <input v-model="f.due_time" type="time" class="inp" :aria-label="t('taskTime')" :disabled="!f.due_date && f.repeat === 'none'">
      </div>
      <span v-if="f.due_time" class="hint">{{ t('taskTimeHint') }}</span>
    </div>

    <div class="grid2">
      <div class="fld"><label for="t-rep">{{ t('taskRepeat') }}</label>
        <select id="t-rep" v-model="f.repeat" class="inp">
          <option value="none">{{ t('rep_none') }}</option><option value="daily">{{ t('rep_daily') }}</option>
          <option value="weekly">{{ t('rep_weekly') }}</option><option value="monthly">{{ t('rep_monthly') }}</option>
        </select></div>
      <div v-if="f.repeat !== 'none'" class="fld"><label for="t-every">{{ t('taskEvery') }}</label><input id="t-every" v-model="f.repeat_every" type="number" min="1" max="12" class="inp"></div>
    </div>

    <div class="fld">
      <span class="lbl">{{ t('taskSteps') }}<span v-if="f.steps.length" class="cap"> · {{ stepsDone }}/{{ f.steps.length }}</span></span>
      <div class="bf-card steps" style="padding: 6px 14px;">
        <div v-for="(s, i) in f.steps" :key="i" class="step" :class="{ 'step--done': s.done }">
          <button type="button" class="tick" :class="{ 'tick--on': s.done }" style="width: 22px; height: 22px;" :aria-label="s.t" @click="toggleStep(i)"><Icon v-if="s.done" name="tick" :size="12" /></button>
          <input v-model="s.t" type="text" maxlength="120" :aria-label="t('taskStep') + ' ' + (i + 1)">
          <button type="button" class="link" style="padding: 0 4px;" :aria-label="t('delete')" @click="f.steps.splice(i, 1)">×</button>
        </div>
        <form class="step" @submit.prevent="addStep">
          <span class="tick" aria-hidden="true" style="width: 22px; height: 22px; opacity: .4;"></span>
          <input ref="stepIn" v-model="newStep" type="text" maxlength="120" :placeholder="t('taskStepPh')" enterkeyhint="done" @blur="addStep">
        </form>
      </div>
    </div>

    <div class="fld"><label for="t-note">{{ t('note') }}</label><textarea id="t-note" v-model="f.note" class="inp" rows="2" maxlength="2000" :placeholder="t('optional')"></textarea></div>

    <section v-if="orig" class="stack">
      <div class="lbl">{{ t('taskComments') }}<span v-if="comments.length" class="cap"> · {{ comments.length }}</span></div>
      <div v-for="c in comments" :key="c.id" class="cmt" :class="{ 'cmt--me': c.member_id === me?.id }">
        <div class="cap"><span v-if="memberById(c.member_id)" :class="`bf-dot bf-p${memberById(c.member_id).color}`"></span>{{ memberById(c.member_id)?.name || '—' }} · {{ when(c.created_at) }}</div>
        <div style="white-space: pre-wrap; margin-top: 2px;">{{ c.body }}</div>
      </div>
      <form class="qadd" @submit.prevent="sendComment">
        <input v-model="cIn" class="inp" maxlength="1000" :placeholder="t('taskCommentPh')" enterkeyhint="send">
        <button type="submit" class="bf-btn bf-btn--secondary" :disabled="!cIn.trim()">{{ t('send') }}</button>
      </form>
    </section>

    <button v-if="orig && !orig.done" type="button" class="bf-btn bf-btn--secondary bf-btn--block" :disabled="busy" @click="markDone"><Icon :name="f.kind === 'money' ? 'cash' : 'tick'" />{{ f.kind === 'money' ? t('taskDoneMoney', f.amount ? money(parseAmount(f.amount)) : '') : t('taskMarkDoneBtn') }}</button>
    <button v-if="orig" type="button" class="bf-btn bf-btn--danger" @click="del"><Icon name="trash" />{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>

    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--secondary" @click="router.back()">{{ t('cancel') }}</button>
      <button type="button" class="bf-btn bf-btn--primary" :disabled="busy" @click="submit">{{ t('save') }}</button>
    </div></div>
  </main>
</template>
