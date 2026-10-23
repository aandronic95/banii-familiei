<script setup>
// Restaurare din backup-ul Excel trimis de bot: adaugă înapoi doar tranzacțiile care lipsesc
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { S, bulkInsert } from '../store.js'
import { t } from '../lib/i18n.js'
import { money0, dateShort } from '../lib/format.js'
import { haptic, confirmDialog } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const router = useRouter()
const file = ref(null)
const plan = ref(null)
const err = ref('')
const busy = ref(false)
const progress = ref(0)

async function pick(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  err.value = ''; plan.value = null
  try {
    const [{ readXlsx }, { planRestore, txSheet }] = await Promise.all([import('../lib/xlsxread.js'), import('../lib/restore.js')])
    const sheets = readXlsx(await f.arrayBuffer())
    const rows = txSheet(sheets)
    if (!rows) { err.value = t('rsNoSheet'); return }
    plan.value = { name: f.name, total: rows.length, ...planRestore(rows, S) }
  } catch (e2) { console.error(e2); err.value = t('rsBadFile') }
}
const missingAccounts = computed(() => [...new Set((plan.value?.skipped || []).filter((x) => x.why === 'account').map((x) => x.name))])
const preview = computed(() => (plan.value?.insert || []).slice(0, 8))

async function run() {
  if (!plan.value?.insert.length) return
  if (!(await confirmDialog(t('rsConfirm', plan.value.insert.length)))) return
  busy.value = true; progress.value = 0
  try {
    const n = await bulkInsert('transactions', plan.value.insert, (d) => { progress.value = d })
    haptic('success'); toast(t('rsDone', n)); router.push('/transactions')
  } catch (e) { console.error(e); err.value = t('error', e) } finally { busy.value = false }
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-title">{{ t('rsTitle') }}</h1>
    <p class="hint" style="margin: 0;">{{ t('rsIntro') }}</p>
    <input ref="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="file-hidden" @change="pick">
    <button type="button" class="bf-btn bf-btn--secondary bf-btn--block" style="height: 56px; border: 1.5px dashed var(--line);" @click="file.click()"><Icon name="upload" />{{ plan ? t('rsOther') : t('rsPick') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>

    <div v-if="plan" class="bf-card stack">
      <div class="cap">{{ plan.name }} · {{ t('rsRows', plan.total) }}</div>
      <div class="dstats">
        <div class="dstat"><div class="dstat__v bf-income">{{ plan.insert.length }}</div><div class="dstat__l">{{ t('rsNew') }}</div></div>
        <div class="dstat"><div class="dstat__v">{{ plan.dup }}</div><div class="dstat__l">{{ t('rsDup') }}</div></div>
      </div>
      <div v-if="plan.skipped.length" class="bf-banner"><Icon name="alert" /><div>{{ t('rsSkipped', plan.skipped.length) }}<span v-if="missingAccounts.length"> {{ t('rsMissingAcc', missingAccounts.join(', ')) }}</span></div></div>
      <template v-if="plan.insert.length">
        <div v-for="(x, i) in preview" :key="i" class="kv"><span class="muted">{{ dateShort(x.date, true) }} · {{ x.merchant || t(x.kind) }}</span><b :class="x.kind === 'income' ? 'bf-income' : x.kind === 'expense' ? 'bf-expense' : ''">{{ x.kind === 'income' ? '+' : x.kind === 'expense' ? '−' : '' }}{{ money0(x.amount) }}</b></div>
        <div v-if="plan.insert.length > preview.length" class="cap">… {{ t('rsMore', plan.insert.length - preview.length) }}</div>
      </template>
      <p v-else class="hint bf-income" style="margin: 0;">✓ {{ t('rsNothing') }}</p>
    </div>

    <div v-if="plan?.insert.length" class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--primary bf-btn--block" :disabled="busy || S.offline" @click="run">{{ busy ? t('rsProgress', progress, plan.insert.length) : t('rsRun', plan.insert.length) }}</button>
    </div></div>
  </main>
</template>
