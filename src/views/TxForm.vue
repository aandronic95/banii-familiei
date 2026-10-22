<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, me, save, remove, accountById, activeAccounts, balances, uploadReceipt, receiptUrl } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { parseAmount, todayISO, money, isExpression } from '../lib/format.js'
import { confirmDialog, haptic } from '../lib/telegram.js'
import { toast } from '../components/Toast.js'
import Icon from '../components/Icon.vue'
import { supabase } from '../lib/supabase.js'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const orig = isNew ? null : S.transactions.find((x) => x.id === route.params.id)
// Tranzacția nu mai există (ștearsă între timp): înapoi la Acasă
if (!isNew && !orig) router.replace('/')

const lastAcc = [...S.transactions].filter((x) => x.created_by === S.userId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.account_id
const defaultAcc = route.query.account || lastAcc || activeAccounts.value[0]?.id || ''
const carCat = S.categories.find((c) => c.kind === 'expense' && c.icon === 'car')

const f = reactive({
  kind: orig?.kind ?? route.query.kind ?? 'expense',
  amount: orig ? String(orig.amount).replace('.', ',') : '',
  category_id: orig?.category_id ?? route.query.category ?? (route.query.car ? carCat?.id : '') ?? '',
  member_id: orig?.member_id ?? me.value?.id ?? '',
  account_id: orig?.account_id ?? defaultAcc,
  to_account_id: orig?.to_account_id ?? '',
  to_amount: orig?.to_amount ? String(orig.to_amount).replace('.', ',') : '',
  date: orig?.date ?? todayISO(),
  merchant: orig?.merchant ?? '',
  note: orig?.note ?? '',
  receipt_path: orig?.receipt_path ?? null,
  car_id: orig?.car_id ?? (route.query.car || S.cars[0]?.id || null),
  car_kind: orig?.car_kind ?? 'fuel',
  fuel_liters: orig?.fuel_liters ? String(orig.fuel_liters).replace('.', ',') : '',
  odometer: orig?.odometer ?? '',
  full_tank: orig?.full_tank ?? true,
  investment_id: orig?.investment_id ?? route.query.investment ?? null,
})
const busy = ref(false)
const err = ref('')
const isInvestMove = f.kind === 'invest' || f.kind === 'divest'
const inv = computed(() => S.investments.find((i) => i.id === f.investment_id))
const receiptPreview = ref('')
const fileInput = ref(null)

const amtInput = ref(null)
onMounted(async () => {
  if (isNew) setTimeout(() => amtInput.value?.focus(), 250)
  if (f.receipt_path) receiptPreview.value = await receiptUrl(f.receipt_path)
})
// Calcul în câmpul sumă: „150+35” → 185,00
const calcResult = computed(() => (isExpression(f.amount) ? parseAmount(f.amount) : null))
function addOp(op) {
  const v = String(f.amount || '').trim()
  if (!v) return
  f.amount = /[+−×÷]$/.test(v) ? v.slice(0, -1) + op : v + op
  amtInput.value?.focus()
}

const cats = computed(() => S.categories.filter((c) => c.kind === (f.kind === 'income' ? 'income' : 'expense') && !c.archived))
watch(() => f.kind, () => { if (!cats.value.some((c) => c.id === f.category_id)) f.category_id = '' })
const acc = computed(() => accountById(f.account_id))
const toAcc = computed(() => accountById(f.to_account_id))
const diffCur = computed(() => f.kind === 'transfer' && acc.value && toAcc.value && acc.value.currency !== toAcc.value.currency)
const isCar = computed(() => f.kind === 'expense' && S.cars.length && S.categories.find((c) => c.id === f.category_id)?.icon === 'car')
const saveLabel = computed(() => t(f.kind === 'income' ? 'saveIncome' : f.kind === 'transfer' ? 'saveTransfer' : f.kind === 'expense' ? 'saveExpense' : 'save'))
const accLabel = (a) => `${a.name} · ${money(balances.value[a.id])} ${a.currency}`

const ocr = ref({ state: '', total: null, merchant: null })
async function pickFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  busy.value = true
  runOcr(file)
  try {
    receiptPreview.value = URL.createObjectURL(file)
    f.receipt_path = await uploadReceipt(file)
  } catch (e2) { console.error(e2); err.value = t('error', e2); receiptPreview.value = '' } finally { busy.value = false; e.target.value = '' }
}
// Citește suma și magazinul de pe bon; completează singur câmpurile goale
async function runOcr(file) {
  if (f.kind === 'transfer') return
  ocr.value = { state: 'reading', total: null, merchant: null }
  try {
    const { readReceipt } = await import('../lib/ocr.js')
    const r = await readReceipt(file)
    ocr.value = { state: r.total ? 'found' : 'none', total: r.total, merchant: r.merchant }
    if (r.total && !parseAmount(f.amount)) { f.amount = String(r.total).replace('.', ','); haptic('success') }
    if (r.merchant && !f.merchant) f.merchant = r.merchant
  } catch (e) { console.warn('ocr', e); ocr.value = { state: 'none', total: null, merchant: null } }
}
function useOcr() {
  if (ocr.value.total) f.amount = String(ocr.value.total).replace('.', ',')
  if (ocr.value.merchant) f.merchant = ocr.value.merchant
  ocr.value.state = 'used'
}
function dropReceipt() { f.receipt_path = null; receiptPreview.value = '' }

async function submit() {
  err.value = ''
  const amount = parseAmount(f.amount)
  if (!(amount > 0)) { err.value = t('amountRequired'); return }
  if (!f.account_id || (f.kind === 'transfer' && (!f.to_account_id || f.to_account_id === f.account_id))) { err.value = t('accountRequired'); return }
  busy.value = true
  try {
    const row = {
      ...(orig ? { id: orig.id } : {}),
      kind: f.kind, amount, account_id: f.account_id, date: f.date || todayISO(),
      category_id: f.kind === 'transfer' || isInvestMove ? null : f.category_id || null,
      member_id: f.member_id || null,
      to_account_id: f.kind === 'transfer' ? f.to_account_id : null,
      to_amount: diffCur.value ? parseAmount(f.to_amount) || null : null,
      merchant: f.merchant.trim() || null, note: f.note.trim() || null, receipt_path: f.receipt_path,
      car_id: isCar.value ? f.car_id : null,
      car_kind: isCar.value ? f.car_kind : null,
      fuel_liters: isCar.value && f.car_kind === 'fuel' ? parseAmount(f.fuel_liters) || null : null,
      odometer: isCar.value && f.odometer !== '' ? parseInt(String(f.odometer).replace(/\D/g, '')) || null : null,
      full_tank: isCar.value && f.car_kind === 'fuel' ? !!f.full_tank : null,
      investment_id: f.kind === 'transfer' ? null : f.investment_id || null,
    }
    if (orig?.receipt_path && orig.receipt_path !== row.receipt_path) supabase.storage.from('receipts').remove([orig.receipt_path])
    await save('transactions', row)
    haptic('success'); toast(t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e); haptic('error') } finally { busy.value = false }
}

async function del() {
  if (!(await confirmDialog(t('deleteTxQ')))) return
  try {
    await remove('transactions', orig.id)
    if (orig.receipt_path) supabase.storage.from('receipts').remove([orig.receipt_path])
    router.back()
  } catch (e) { console.error(e); err.value = t('error', e) }
}
</script>

<template>
  <main class="page page--form">
    <h1 class="h-sec" style="text-align: center;">{{ isNew ? t('newTx') : t('editTx') }}</h1>

    <div v-if="isInvestMove" class="bf-chip bf-chip--on" style="align-self: center;">{{ t(f.kind === 'invest' ? 'invested' : 'returned') }}</div>
    <div v-else class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr));" role="group">
      <button v-for="k in ['expense', 'income', 'transfer']" :key="k" type="button" :class="{ on: f.kind === k }" @click="f.kind = k">{{ t(k) }}</button>
    </div>

    <div style="text-align: center;">
      <label for="amt" class="muted" style="font: 600 13px/18px var(--font-sans);">{{ t('amount') }}</label>
      <div style="display: flex; align-items: baseline; justify-content: center; gap: 8px; margin-top: 4px;">
        <input id="amt" ref="amtInput" v-model="f.amount" inputmode="decimal" placeholder="0" autocomplete="off" enterkeyhint="done"
               :style="{ font: `700 ${String(f.amount).length > 9 ? 32 : 44}px/52px var(--font-sans)`, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', background: 'transparent', border: 0, width: '220px', textAlign: 'right', outline: 'none' }">
        <span class="bf-chip">{{ acc?.currency || 'MDL' }}</span>
      </div>
      <div class="amt-tools">
        <button v-for="op in ['+', '−', '×', '÷']" :key="op" type="button" class="amt-op" :aria-label="op" @click="addOp(op)">{{ op }}</button>
      </div>
      <div v-if="calcResult !== null" class="cap" style="margin-top: 6px;" aria-live="polite">= {{ money(calcResult) }} {{ acc?.currency || 'MDL' }}</div>
    </div>

    <div v-if="inv" class="bf-banner" style="background: var(--brand-soft);">
      <Icon name="chart" />
      <div><b>{{ t('investmentLink') }}:</b> {{ [inv.platform, inv.name, inv.code].filter(Boolean).join(' · ') }}</div>
    </div>

    <div v-if="f.kind !== 'transfer' && !isInvestMove" class="fld">
      <span class="lbl">{{ t('category') }}</span>
      <div class="bf-chips">
        <button v-for="c in cats" :key="c.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.category_id === c.id }" @click="f.category_id = f.category_id === c.id ? '' : c.id"><Icon :name="c.icon" :size="16" />{{ catName(c) }}</button>
      </div>
    </div>

    <div v-if="f.kind !== 'transfer'" class="fld">
      <span class="lbl">{{ t('who') }}</span>
      <div class="bf-chips">
        <button v-for="m in S.members" :key="m.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': f.member_id === m.id }" @click="f.member_id = m.id"><span :class="`bf-dot bf-p${m.color}`"></span>{{ m.name }}</button>
      </div>
    </div>

    <div class="fld">
      <label for="acc">{{ f.kind === 'income' || f.kind === 'divest' ? t('toAccount') : t('fromAccount') }}</label>
      <select id="acc" v-model="f.account_id" class="inp">
        <option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ accLabel(a) }}</option>
      </select>
    </div>
    <div v-if="f.kind === 'transfer'" class="fld">
      <label for="acc2">{{ t('toAccount') }}</label>
      <select id="acc2" v-model="f.to_account_id" class="inp">
        <option value="" disabled>—</option>
        <option v-for="a in activeAccounts.filter((x) => x.id !== f.account_id)" :key="a.id" :value="a.id">{{ accLabel(a) }}</option>
      </select>
    </div>
    <div v-if="diffCur" class="fld"><label for="toamt">{{ t('amountReceived') }}, {{ toAcc.currency }}</label><input id="toamt" v-model="f.to_amount" class="inp" inputmode="decimal"></div>

    <template v-if="isCar">
      <div class="fld">
        <span class="lbl">{{ t('carPart') }}</span>
        <div class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
          <button v-for="k in ['fuel', 'service', 'other']" :key="k" type="button" :class="{ on: f.car_kind === k }" @click="f.car_kind = k">{{ t(k === 'fuel' ? 'fuel' : k === 'service' ? 'carService' : 'carOther') }}</button>
        </div>
      </div>
      <div v-if="S.cars.length > 1" class="fld">
        <label for="car">{{ t('car') }}</label>
        <select id="car" v-model="f.car_id" class="inp"><option v-for="c in S.cars" :key="c.id" :value="c.id">{{ c.name }}</option></select>
      </div>
      <div class="grid2">
        <div v-if="f.car_kind === 'fuel'" class="fld"><label for="lit">{{ t('liters') }}</label><input id="lit" v-model="f.fuel_liters" class="inp" inputmode="decimal"></div>
        <div class="fld"><label for="odo">{{ t('odometer') }}, km</label><input id="odo" v-model="f.odometer" class="inp" inputmode="numeric"></div>
      </div>
      <label v-if="f.car_kind === 'fuel'" class="bf-row bf-list" for="full">
        <div class="bf-row__body"><div class="bf-row__title">{{ t('fullTank') }}</div></div>
        <input id="full" v-model="f.full_tank" type="checkbox" class="sw">
      </label>
    </template>

    <div class="grid2">
      <div class="fld"><label for="dt">{{ t('date') }}</label><input id="dt" v-model="f.date" type="date" class="inp"></div>
      <div v-if="f.kind !== 'transfer'" class="fld"><label for="shop">{{ t('merchant') }}</label><input id="shop" v-model="f.merchant" class="inp" maxlength="60"></div>
    </div>
    <div class="fld"><label for="note">{{ t('note') }}</label><input id="note" v-model="f.note" class="inp" :placeholder="t('optional')" maxlength="200"></div>

    <div v-if="f.kind !== 'transfer'" class="stack">
      <img v-if="receiptPreview" :src="receiptPreview" class="receipt-img" :alt="t('receipt')">
      <div v-if="ocr.state === 'reading'" class="bf-banner" style="background: var(--surface-2);" role="status"><div class="spinner" style="width: 18px; height: 18px; border-width: 2px;"></div><div>{{ t('ocrReading') }}</div></div>
      <div v-else-if="ocr.state === 'found'" class="bf-banner" style="background: var(--brand-soft); align-items: center;">
        <Icon name="check" />
        <div style="flex: 1;">{{ t('ocrFound', money(ocr.total) + (ocr.merchant ? ' · ' + ocr.merchant : '')) }}</div>
        <button type="button" class="link" style="padding: 0;" @click="useOcr">{{ t('ocrUse') }}</button>
      </div>
      <div v-else-if="ocr.state === 'none'" class="hint">{{ t('ocrNone') }}</div>
      <input ref="fileInput" id="rcpt" type="file" accept="image/*" capture="environment" class="file-hidden" @change="pickFile">
      <button type="button" class="bf-btn bf-btn--secondary bf-btn--block" style="height: 56px; border: 1.5px dashed var(--line);" @click="fileInput.click()">
        <Icon name="camera" />{{ receiptPreview ? t('receiptChange') : t('receipt') }}
      </button>
      <button v-if="receiptPreview" type="button" class="link" @click="dropReceipt">{{ t('receiptRemove') }}</button>
    </div>

    <button v-if="!isNew" type="button" class="bf-btn bf-btn--danger" @click="del"><Icon name="trash" />{{ t('delete') }}</button>
    <p v-if="err" class="err" role="alert">{{ err }}</p>

    <div class="bottom-bar"><div>
      <button type="button" class="bf-btn bf-btn--primary bf-btn--block" :disabled="busy" @click="submit">{{ saveLabel }}</button>
    </div></div>
  </main>
</template>
