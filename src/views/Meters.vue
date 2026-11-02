<script setup>
// Contoare: lumină, gaz, apă, căldură — indicii lunari, consumul, costul estimat, comparații
import { ref, reactive, computed } from 'vue'
import { S, save, remove } from '../store.js'
import { meterUsage } from '../lib/home.js'
import { t } from '../lib/i18n.js'
import { money, money0, todayISO, dateShort, monthShort, parseAmount } from '../lib/format.js'
import { haptic, confirmDialog } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'

const KIND = { electricity: { icon: 'bolt', unit: 'kWh' }, gas: { icon: 'flame', unit: 'm³' }, water_cold: { icon: 'drop', unit: 'm³' }, water_hot: { icon: 'drop', unit: 'm³' }, heat: { icon: 'flame', unit: 'Gcal' }, other: { icon: 'gauge', unit: '' } }
const today = todayISO()
const meters = computed(() => S.meters.filter((m) => !m.archived).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)))
const fmtN = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString('ro-RO', { maximumFractionDigits: d }).replace(/ /g, ' '))

const info = computed(() => Object.fromEntries(meters.value.map((m) => {
  const u = meterUsage(S.readings.filter((r) => r.meter_id === m.id))
  const [y, mo] = today.split('-').map(Number)
  const bars = []
  for (let k = 11; k >= 0; k--) {
    const d = new Date(Date.UTC(y, mo - 1 - k, 1))
    const key = d.toISOString().slice(0, 7)
    bars.push({ key, label: monthShort(d.getUTCMonth()), v: u.months[key] || 0 })
  }
  const max = Math.max(1, ...bars.map((b) => b.v))
  const thisM = u.months[today.slice(0, 7)] ?? null
  const lastK = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7)
  const yearK = `${y - 1}-${String(mo).padStart(2, '0')}`
  const rk = u.lastPeriod ? u.lastPeriod.to.slice(0, 7) : null
  const cur = rk ? u.months[rk] : null
  const prev = rk ? u.months[new Date(Date.UTC(+rk.slice(0, 4), +rk.slice(5) - 2, 1)).toISOString().slice(0, 7)] : null
  const lastYear = rk ? u.months[`${+rk.slice(0, 4) - 1}-${rk.slice(5)}`] : null
  return [m.id, { ...u, bars: bars.map((b) => ({ ...b, h: Math.max(2, Math.round((b.v / max) * 70)) })), thisM, lastK, yearK, cur, prev, lastYear,
    cost: cur != null && m.tariff ? cur * Number(m.tariff) : null, ref: rk }]
})))
const pctDiff = (a, b) => (a != null && b ? Math.round(((a - b) / b) * 100) : null)

// Indice nou
const inputs = reactive({})
const busy = ref('')
async function addReading(m) {
  const v = parseAmount(inputs[m.id])
  if (!(v >= 0) || inputs[m.id] === '' || inputs[m.id] == null) return
  const last = info.value[m.id].last
  if (last && v < Number(last.value) && !(await confirmDialog(t('mtrLowerQ', fmtN(last.value, 3))))) return
  busy.value = m.id
  try {
    await save('meter_readings', { meter_id: m.id, date: today, value: v })
    inputs[m.id] = ''
    haptic('success')
    const used = last ? v - Number(last.value) : null
    toast(used != null && used >= 0 ? t('mtrSaved', fmtN(used, 2), m.unit) + (m.tariff ? ' · ~' + money0(used * Number(m.tariff)) + ' MDL' : '') : t('saved'))
  } catch (e) { console.error(e); toast(t('error', e)) } finally { busy.value = '' }
}
async function delReading(r) { await remove('meter_readings', r.id) }

// Contor nou / modificat
const edit = ref(null)
function openEdit(m) {
  edit.value = m ? { id: m.id, name: m.name, kind: m.kind, unit: m.unit, tariff: m.tariff != null ? String(Number(m.tariff)).replace('.', ',') : '', reminder_day: m.reminder_day || '' }
    : { name: '', kind: 'electricity', unit: 'kWh', tariff: '', reminder_day: 25 }
}
function setKind(k) { edit.value.kind = k; edit.value.unit = KIND[k].unit; if (!edit.value.name) edit.value.name = t('mk_' + k) }
async function saveMeter() {
  const e = edit.value
  if (!e.name.trim()) return
  await save('meters', { ...(e.id ? { id: e.id } : { sort: S.meters.length + 1 }), name: e.name.trim(), kind: e.kind, unit: e.unit.trim() || KIND[e.kind].unit,
    tariff: parseAmount(e.tariff) > 0 ? parseAmount(e.tariff) : null, reminder_day: Number(e.reminder_day) >= 1 && Number(e.reminder_day) <= 28 ? Number(e.reminder_day) : null })
  edit.value = null
  haptic('success')
}
async function archiveMeter() {
  if (!(await confirmDialog(t('mtrDeleteQ')))) return
  await save('meters', { id: edit.value.id, archived: true }); edit.value = null
}
const history = ref('')
const readingsOf = (id) => S.readings.filter((r) => r.meter_id === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
</script>

<template>
  <main class="page">
    <div class="sec-head">
      <h1 class="h-title">{{ t('mtrTitle') }}</h1>
      <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="openEdit(null)"><Icon name="plus" />{{ t('add') }}</button>
    </div>

    <div v-if="edit" class="bf-card stack">
      <h2 class="h-sec">{{ edit.id ? t('mtrEdit') : t('mtrNew') }}</h2>
      <div class="bf-chips">
        <button v-for="k in Object.keys(KIND)" :key="k" type="button" class="bf-chip" :class="{ 'bf-chip--on': edit.kind === k }" @click="setKind(k)"><Icon :name="KIND[k].icon" :size="16" />{{ t('mk_' + k) }}</button>
      </div>
      <div class="grid2">
        <div class="fld"><label for="m-n">{{ t('name') }}</label><input id="m-n" v-model="edit.name" class="inp" maxlength="40"></div>
        <div class="fld"><label for="m-u">{{ t('mtrUnit') }}</label><input id="m-u" v-model="edit.unit" class="inp" maxlength="10"></div>
        <div class="fld"><label for="m-t">{{ t('mtrTariff', edit.unit || '…') }}</label><input id="m-t" v-model="edit.tariff" class="inp" inputmode="decimal" :placeholder="t('optional')"></div>
        <div class="fld"><label for="m-r">{{ t('mtrReminder') }}</label><input id="m-r" v-model="edit.reminder_day" type="number" min="1" max="28" class="inp" :placeholder="t('optional')"></div>
      </div>
      <p class="hint" style="margin: 0;">{{ t('mtrReminderHint') }}</p>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="bf-btn bf-btn--secondary" @click="edit = null">{{ t('cancel') }}</button>
        <button type="button" class="bf-btn bf-btn--primary" style="flex: 1;" :disabled="!edit.name.trim()" @click="saveMeter">{{ t('save') }}</button>
      </div>
      <button v-if="edit.id" type="button" class="link" style="align-self: center; padding: 0; color: var(--danger);" @click="archiveMeter">{{ t('mtrDelete') }}</button>
    </div>

    <div v-if="!meters.length && !edit" class="bf-card empty stack">
      <span>{{ t('mtrEmpty') }}</span>
      <button type="button" class="bf-btn bf-btn--primary" @click="openEdit(null)">{{ t('mtrNew') }}</button>
    </div>

    <section v-for="m in meters" :key="m.id" class="bf-card stack">
      <div class="sec-head">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="bf-row__icon"><Icon :name="KIND[m.kind]?.icon || 'gauge'" /></span>
          <div>
            <h2 class="h-sec" style="margin: 0;">{{ m.name }}</h2>
            <div class="cap">{{ info[m.id].last ? t('mtrLast', fmtN(info[m.id].last.value, 3), m.unit, dateShort(info[m.id].last.date)) : t('mtrNoReading') }}</div>
          </div>
        </div>
        <button type="button" class="link" @click="openEdit(m)">{{ t('edit') }}</button>
      </div>

      <form class="qadd" @submit.prevent="addReading(m)">
        <input v-model="inputs[m.id]" class="inp" inputmode="decimal" :placeholder="t('mtrInputPh', m.unit)" :aria-label="t('mtrInputPh', m.unit) + ' ' + m.name">
        <button type="submit" class="bf-btn bf-btn--primary" :disabled="busy === m.id || !inputs[m.id]">{{ t('save') }}</button>
      </form>

      <template v-if="info[m.id].cur != null">
        <div class="dstats">
          <div class="dstat"><div class="dstat__v">{{ fmtN(info[m.id].cur, 1) }} <small>{{ m.unit }}</small></div><div class="dstat__l">{{ t('mtrUsed', monthShort(+info[m.id].ref.slice(5) - 1)) }}</div></div>
          <div class="dstat"><div class="dstat__v">{{ info[m.id].cost != null ? money0(info[m.id].cost) : '—' }} <small v-if="info[m.id].cost != null">MDL</small></div><div class="dstat__l">{{ m.tariff ? t('mtrCost') : t('mtrNoTariff') }}</div></div>
          <div class="dstat"><div class="dstat__v" :class="pctDiff(info[m.id].cur, info[m.id].prev) > 0 ? 'bf-expense' : 'bf-income'">{{ pctDiff(info[m.id].cur, info[m.id].prev) == null ? '—' : (pctDiff(info[m.id].cur, info[m.id].prev) > 0 ? '+' : '') + pctDiff(info[m.id].cur, info[m.id].prev) + '%' }}</div><div class="dstat__l">{{ t('mtrVsPrev') }}</div></div>
          <div class="dstat"><div class="dstat__v" :class="pctDiff(info[m.id].cur, info[m.id].lastYear) > 0 ? 'bf-expense' : 'bf-income'">{{ pctDiff(info[m.id].cur, info[m.id].lastYear) == null ? '—' : (pctDiff(info[m.id].cur, info[m.id].lastYear) > 0 ? '+' : '') + pctDiff(info[m.id].cur, info[m.id].lastYear) + '%' }}</div><div class="dstat__l">{{ t('mtrVsYear') }}</div></div>
        </div>
        <div class="wd" style="grid-template-columns: repeat(12, minmax(0, 1fr)); height: 96px;" role="img" :aria-label="info[m.id].bars.map((b) => `${b.label}: ${fmtN(b.v, 1)} ${m.unit}`).join(', ')">
          <div v-for="b in info[m.id].bars" :key="b.key">
            <i :class="{ top: b.key === info[m.id].ref }" :style="{ height: b.h + 'px', background: 'var(--brand)', opacity: b.v ? (b.key === info[m.id].ref ? 1 : 0.55) : 0.15 }"></i>
            <span class="cap" style="font-size: 10px;">{{ b.label.slice(0, 3) }}</span>
          </div>
        </div>
        <p v-if="info[m.id].perDay" class="hint" style="margin: 0;">{{ t('mtrPerDay', fmtN(info[m.id].perDay, 2), m.unit) }}{{ m.tariff ? ' · ~' + money(info[m.id].perDay * m.tariff * 30) + ' MDL ' + t('mtrPerMonth') : '' }}</p>
      </template>
      <p v-else-if="info[m.id].last" class="hint" style="margin: 0;">{{ t('mtrNeedTwo') }}</p>

      <button type="button" class="link" style="align-self: flex-start; padding: 0;" @click="history = history === m.id ? '' : m.id">{{ history === m.id ? t('gHide') : t('mtrHistory') }}</button>
      <template v-if="history === m.id">
        <div v-for="r in readingsOf(m.id)" :key="r.id" class="kv">
          <span class="muted">{{ dateShort(r.date, true) }}</span>
          <span><b>{{ fmtN(r.value, 3) }}</b> {{ m.unit }} <button type="button" class="link" style="padding: 0 0 0 8px;" :aria-label="t('delete')" @click="delReading(r)">×</button></span>
        </div>
      </template>
    </section>
    <p class="hint">{{ t('mtrHint') }}</p>
  </main>
</template>
