<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { S, me, save, remove, accountById, activeAccounts, balances, uploadReceipt, receiptUrl, saveSplit, splitSiblings, normTag, tagStats, categoryById } from '../store.js'
import { t, catName } from '../lib/i18n.js'
import { parseAmount, todayISO, money, isExpression, dateShort } from '../lib/format.js'
import { confirmDialog, haptic, qrSupported, scanQr, openLink } from '../lib/telegram.js'
import { parseFiscalQr } from '../lib/fiscal.js'
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
  tags: orig?.tags ? [...orig.tags] : route.query.tag ? [normTag(route.query.tag)] : [],
  fiscal_ref: orig?.fiscal_ref ?? null,
})

// Codul QR de pe bonul fiscal: suma și data exacte; magazinul îl învățăm din bonurile anterioare de la același aparat
const qr = ref(null) // { url, dup, learned }
async function scanReceiptQr() {
  const text = await scanQr(t('qrHint'), (x) => !!parseFiscalQr(x))
  const r = text && parseFiscalQr(text)
  if (!r) return
  haptic('success')
  if (r.amount) f.amount = String(r.amount).replace('.', ',')
  if (r.date) f.date = r.date
  f.fiscal_ref = r.ref
  const dup = r.ref ? S.transactions.find((x) => x.fiscal_ref === r.ref && x.id !== orig?.id) : null
  const prev = r.code ? [...S.transactions].filter((x) => x.fiscal_ref?.startsWith(r.code + '/') && x.id !== orig?.id).sort((a, b) => b.date.localeCompare(a.date))[0] : null
  if (prev) {
    if (!f.merchant && prev.merchant) f.merchant = prev.merchant
    if (!f.category_id && prev.category_id && cats.value.some((c) => c.id === prev.category_id)) f.category_id = prev.category_id
  }
  qr.value = { url: r.url, dup, learned: !!prev, amount: r.amount, date: r.date }
}

// Etichete: #vacanță, #renovare — se adaugă cu Enter, virgulă sau spațiu
const tagInput = ref('')
const tagSuggest = computed(() => tagStats.value.map((x) => x.tag).filter((x) => !f.tags.includes(x)).slice(0, 6))
function addTag(v) {
  const n = normTag(v)
  if (n && !f.tags.includes(n) && f.tags.length < 8) f.tags.push(n)
  tagInput.value = ''
}
function onTagKey(e) { if (['Enter', ',', ' '].includes(e.key)) { e.preventDefault(); addTag(tagInput.value) } }

// Bon împărțit pe categorii: restul rămâne pe categoria aleasă sus
const parts = ref([])
const canSplit = computed(() => isNew && f.kind === 'expense')
const partsSum = computed(() => parts.value.reduce((sum, p) => sum + (parseAmount(p.amount) || 0), 0))
const rest = computed(() => Math.round(((parseAmount(f.amount) || 0) - partsSum.value) * 100) / 100)
function addPart() { parts.value.push({ category_id: '', amount: '' }) }
const siblings = computed(() => splitSiblings(orig))

// Salvează și ca șablon (adăugare dintr-o atingere de pe Acasă)
const asTemplate = ref(false)
const tplName = computed(() => (f.merchant.trim() || catName(categoryById(f.category_id)) || t(f.kind)).slice(0, 40))
// O poză de bon poate fi folosită de mai multe rânduri (bon împărțit): o ștergem doar dacă nu mai e folosită
const receiptUsedElsewhere = (path, exceptId) => S.transactions.some((x) => x.receipt_path === path && x.id !== exceptId)
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
      tags: f.kind === 'transfer' ? [] : f.tags,
      fiscal_ref: f.kind === 'transfer' ? null : f.fiscal_ref,
    }
    if (parts.value.length) {
      if (parts.value.some((p) => !(parseAmount(p.amount) > 0) || !p.category_id)) { err.value = t('splitPartBad'); return }
      if (!(rest.value > 0)) { err.value = t('splitRestBad'); return }
    }
    if (orig?.receipt_path && orig.receipt_path !== row.receipt_path && !receiptUsedElsewhere(orig.receipt_path, orig.id)) supabase.storage.from('receipts').remove([orig.receipt_path])
    let saved
    if (parts.value.length) {
      const carless = { car_id: null, car_kind: null, fuel_liters: null, odometer: null, full_tank: null }
      const list = await saveSplit({ ...row, amount: rest.value }, [{}, ...parts.value.map((p) => ({ ...carless, category_id: p.category_id, amount: parseAmount(p.amount) }))])
      saved = list[0]
    } else saved = await save('transactions', row)
    if (asTemplate.value && !parts.value.length) {
      await save('templates', {
        name: tplName.value, kind: f.kind, amount: row.amount, account_id: row.account_id, category_id: row.category_id, member_id: row.member_id,
        merchant: row.merchant, car_id: row.car_id, car_kind: row.car_kind, tags: row.tags, sort: S.templates.length + 1,
      })
    }
    haptic('success'); if (!saved._pending) toast(parts.value.length ? t('splitSaved', parts.value.length + 1) : t('saved')); router.back()
  } catch (e) { console.error(e); err.value = t('error', e); haptic('error') } finally { busy.value = false }
}

async function del() {
  if (!(await confirmDialog(t('deleteTxQ')))) return
  try {
    // Poza bonului se șterge doar după ce trece timpul pentru „Anulează”
    const path = orig.receipt_path
    await remove('transactions', orig.id, { onFinal: () => { if (path && !receiptUsedElsewhere(path, orig.id)) supabase.storage.from('receipts').remove([path]) } })
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

    <div v-if="siblings.length" class="bf-banner" style="background: var(--surface-2);">
      <Icon name="list" />
      <div>{{ t('splitPartOf', siblings.length + 1) }}
        <span v-for="x in siblings" :key="x.id"> · <button type="button" class="link" style="padding: 0;" @click="router.replace('/tx/' + x.id)">{{ catName(categoryById(x.category_id)) || '—' }} {{ money(x.amount) }}</button></span>
      </div>
    </div>

    <div v-if="f.kind !== 'transfer' && !isInvestMove" class="fld">
      <span class="lbl">{{ parts.length ? t('splitMain', money(rest)) : t('category') }}</span>
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

    <div v-if="f.kind !== 'transfer'" class="fld">
      <label for="tagin">{{ t('tags') }}</label>
      <div class="tagbox">
        <button v-for="(tg, i) in f.tags" :key="tg" type="button" class="bf-chip bf-chip--on" :aria-label="t('tagRemove', tg)" @click="f.tags.splice(i, 1)">#{{ tg }} ×</button>
        <input id="tagin" v-model="tagInput" class="tagbox__in" :placeholder="f.tags.length ? '' : t('tagsPh')" enterkeyhint="done" autocomplete="off" maxlength="24" @keydown="onTagKey" @blur="tagInput && addTag(tagInput)">
      </div>
      <div v-if="tagSuggest.length" class="bf-chips" style="margin-top: 6px;">
        <button v-for="tg in tagSuggest" :key="tg" type="button" class="bf-chip" style="min-height: 30px; font-size: 13px;" @click="addTag(tg)">#{{ tg }}</button>
      </div>
    </div>

    <div v-if="canSplit" class="stack">
      <div v-for="(p, i) in parts" :key="i" class="split-row">
        <select v-model="p.category_id" class="inp" :aria-label="t('category')">
          <option value="" disabled>{{ t('category') }}</option>
          <option v-for="c in cats" :key="c.id" :value="c.id">{{ catName(c) }}</option>
        </select>
        <input v-model="p.amount" class="inp" inputmode="decimal" :placeholder="t('amount')" style="text-align: right;">
        <button type="button" class="amt-op" :aria-label="t('delete')" @click="parts.splice(i, 1)">×</button>
      </div>
      <button type="button" class="link" style="align-self: flex-start; padding: 0;" :disabled="!(parseAmount(f.amount) > 0)" @click="addPart">+ {{ parts.length ? t('splitAddMore') : t('splitAdd') }}</button>
      <p v-if="parts.length" class="hint" style="margin: 0;" :class="{ err: rest <= 0 }">{{ t('splitHint', money(partsSum), money(rest)) }}</p>
    </div>

    <label v-if="isNew && !parts.length && (f.kind === 'expense' || f.kind === 'income') && !isInvestMove" class="bf-row bf-list" for="tpl">
      <div class="bf-row__body"><div class="bf-row__title">{{ t('tplSave') }}</div><div class="bf-row__sub">{{ t('tplSaveSub', tplName) }}</div></div>
      <input id="tpl" v-model="asTemplate" type="checkbox" class="sw">
    </label>

    <div v-if="f.kind !== 'transfer'" class="stack">
      <img v-if="receiptPreview" :src="receiptPreview" class="receipt-img" :alt="t('receipt')">
      <div v-if="ocr.state === 'reading'" class="bf-banner" style="background: var(--surface-2);" role="status"><div class="spinner" style="width: 18px; height: 18px; border-width: 2px;"></div><div>{{ t('ocrReading') }}</div></div>
      <div v-else-if="ocr.state === 'found'" class="bf-banner" style="background: var(--brand-soft); align-items: center;">
        <Icon name="check" />
        <div style="flex: 1;">{{ t('ocrFound', money(ocr.total) + (ocr.merchant ? ' · ' + ocr.merchant : '')) }}</div>
        <button type="button" class="link" style="padding: 0;" @click="useOcr">{{ t('ocrUse') }}</button>
      </div>
      <div v-else-if="ocr.state === 'none'" class="hint">{{ t('ocrNone') }}</div>
      <div v-if="qr" class="bf-banner" :class="{ 'bf-banner--danger': qr.dup }" :style="qr.dup ? '' : 'background: var(--brand-soft);'">
        <Icon :name="qr.dup ? 'alert' : 'check'" />
        <div style="flex: 1;">
          <div v-if="qr.dup"><b>{{ t('qrDup') }}</b> {{ dateShort(qr.dup.date) }} · {{ money(qr.dup.amount) }}</div>
          <div v-else>{{ t('qrRead', qr.amount ? money(qr.amount) : '—', qr.date ? dateShort(qr.date) : '—') }}<span v-if="qr.learned"> · {{ t('qrLearned') }}</span></div>
          <button v-if="qr.url" type="button" class="link" style="padding: 4px 0 0;" @click="openLink(qr.url)">{{ t('qrOpen') }}</button>
        </div>
      </div>
      <button v-if="qrSupported() && f.kind === 'expense'" type="button" class="bf-btn bf-btn--secondary bf-btn--block" @click="scanReceiptQr"><Icon name="qr" />{{ t('qrScan') }}</button>
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
