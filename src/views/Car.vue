<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { S, save, toMdl, txCurrency, monthRange, carCost } from '../store.js'
import { t } from '../lib/i18n.js'
import { money, money0, dateLong, daysUntil } from '../lib/format.js'
import TxRow from '../components/TxRow.vue'
import Icon from '../components/Icon.vue'

const router = useRouter()
const carId = ref(S.cars[0]?.id || null)
const car = computed(() => S.cars.find((c) => c.id === carId.value))
const txs = computed(() => S.transactions.filter((x) => x.car_id === carId.value).sort((a, b) => b.date.localeCompare(a.date) || (b.odometer || 0) - (a.odometer || 0)))
const odometer = computed(() => Math.max(car.value?.odometer_start || 0, ...txs.value.map((x) => x.odometer || 0)))

// Consum: între două alimentări „plin”, litrii puși după prima / km parcurși
const consumption = computed(() => {
  const fuel = txs.value.filter((x) => x.car_kind === 'fuel' && x.odometer).sort((a, b) => a.odometer - b.odometer)
  let lastFull = null, liters = 0
  const samples = []
  for (const x of fuel) {
    if (lastFull) liters += Number(x.fuel_liters || 0)
    if (x.full_tank) {
      if (lastFull && x.odometer > lastFull.odometer && liters > 0) samples.push((liters / (x.odometer - lastFull.odometer)) * 100)
      lastFull = x; liters = 0
    }
  }
  const last = samples.slice(-5)
  return last.length ? last.reduce((a, b) => a + b, 0) / last.length : null
})
const monthSpend = computed(() => {
  const [a, b] = monthRange()
  return txs.value.filter((x) => x.date >= a && x.date <= b && x.kind === 'expense').reduce((s, x) => s + toMdl(x.amount, txCurrency(x)), 0)
})
const events = computed(() => S.carEvents.filter((e) => e.car_id === carId.value && !e.done)
  .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')))
const soon = computed(() => events.value.find((e) => e.due_date && daysUntil(e.due_date) <= 30))
const fuels = computed(() => txs.value.filter((x) => x.car_kind === 'fuel').slice(0, 5))
const services = computed(() => txs.value.filter((x) => x.car_kind && x.car_kind !== 'fuel').slice(0, 5))
const evIcon = (k) => (k === 'rca' || k === 'casco' ? 'shield' : k === 'inspection' ? 'check' : 'wrench')
const evSub = (e) => {
  const bits = []
  if (e.due_date) bits.push(dateLong(e.due_date))
  if (e.due_km) bits.push(t('kmLeft', money0(Math.max(0, e.due_km - odometer.value))))
  return bits.join(' · ')
}
// Costul pe km: 3, 6 sau 12 luni
const costN = ref(12)
const cost = computed(() => (car.value ? carCost(car.value.id, costN.value) : null))
const costParts = computed(() => {
  if (!cost.value?.total) return []
  return [['fuel', t('fuel')], ['service', t('carService')], ['other', t('carOtherIns')]]
    .map(([k, label]) => ({ k, label, v: cost.value.parts[k], pct: Math.round((cost.value.parts[k] / cost.value.total) * 100) }))
    .filter((p) => p.v > 0)
})
async function done(e) { await save('car_events', { id: e.id, done: true }) }
</script>

<template>
  <main class="page">
    <template v-if="!car">
      <h1 class="h-title">{{ t('carTitle') }}</h1>
      <div class="bf-card empty stack">
        <span>{{ t('noCar') }}</span>
        <button type="button" class="bf-btn bf-btn--primary" @click="router.push('/car-edit/new')">{{ t('newCar') }}</button>
      </div>
    </template>
    <template v-else>
      <div class="sec-head" style="align-items: flex-start;">
        <div>
          <h1 class="h-title">{{ car.name }}</h1>
          <div v-if="car.plate" class="muted" style="font: 500 13px/18px var(--font-sans);">{{ car.plate }}</div>
        </div>
        <button type="button" class="bf-btn bf-btn--secondary" style="min-height: 40px;" @click="router.push('/car-edit/' + car.id)">{{ t('edit') }}</button>
      </div>
      <div v-if="S.cars.length > 1" class="bf-chips">
        <button v-for="c in S.cars" :key="c.id" type="button" class="bf-chip" :class="{ 'bf-chip--on': c.id === carId }" @click="carId = c.id">{{ c.name }}</button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">
        <div class="stat"><b>{{ money0(odometer) }}</b><span>{{ t('kmOnBoard') }}</span></div>
        <div class="stat"><b>{{ consumption ? consumption.toFixed(1).replace('.', ',') + ' L' : '—' }}</b><span>{{ t('per100') }}</span></div>
        <div class="stat"><b>{{ money0(monthSpend) }}</b><span>{{ t('thisMonth') }}</span></div>
      </div>

      <div v-if="soon" class="bf-banner" :class="{ 'bf-banner--danger': daysUntil(soon.due_date) < 0 }">
        <Icon name="shield" />
        <div><b>{{ t('expiresIn', soon.title, daysUntil(soon.due_date) < 0 ? dateLong(soon.due_date) : t('inDays', daysUntil(soon.due_date))) }}</b></div>
      </div>

      <div class="bf-card stack">
        <div class="sec-head"><h2 class="h-sec">{{ t('carCostTitle') }}</h2></div>
        <div class="bf-chips">
          <button v-for="n in [3, 6, 12]" :key="n" type="button" class="bf-chip" :class="{ 'bf-chip--on': costN === n }" @click="costN = n">{{ t('nMonths', n) }}</button>
        </div>
        <template v-if="cost && cost.total">
          <div>
            <div class="bf-balance__label">{{ t('carPerKm') }}</div>
            <div class="bf-balance__amount" style="font-size: 30px;">{{ cost.perKm ? money(cost.perKm) : '—' }}<span class="bf-balance__cur">MDL/km</span></div>
            <div v-if="!cost.perKm" class="hint">{{ t('carPerKmNeed') }}</div>
          </div>
          <div class="dstats">
            <div class="dstat"><div class="dstat__v">{{ money0(cost.perMonth) }}</div><div class="dstat__l">{{ t('carPerMonth') }}</div></div>
            <div class="dstat"><div class="dstat__v">{{ money0(cost.perYear) }}</div><div class="dstat__l">{{ t('carPerYear') }}</div></div>
            <div class="dstat"><div class="dstat__v">{{ money0(cost.km) }}</div><div class="dstat__l">{{ t('carKmDriven') }}</div></div>
            <div class="dstat"><div class="dstat__v">{{ money0(cost.total) }}</div><div class="dstat__l">{{ t('dTotal') }}</div></div>
          </div>
          <div style="display: flex; height: 10px; border-radius: 999px; overflow: hidden; gap: 2px;" role="img" :aria-label="costParts.map((p) => `${p.label} ${p.pct}%`).join(', ')">
            <div v-for="(p, i) in costParts" :key="p.k" :style="{ width: p.pct + '%', background: ['var(--brand)', 'var(--person-2)', 'var(--person-3)'][i] }"></div>
          </div>
          <div v-for="(p, i) in costParts" :key="p.k" class="kv">
            <span><span class="bf-dot" :style="{ background: ['var(--brand)', 'var(--person-2)', 'var(--person-3)'][i] }"></span>{{ p.label }}</span>
            <b>{{ money0(p.v) }} MDL · {{ p.pct }}%{{ cost.perKm && cost.km ? ' · ' + money(p.v / cost.km) + '/km' : '' }}</b>
          </div>
        </template>
        <p v-else class="hint" style="margin: 0;">{{ t('carCostEmpty') }}</p>
      </div>

      <div class="grid2">
        <button type="button" class="bf-btn bf-btn--primary" @click="router.push({ path: '/tx/new', query: { car: car.id } })"><Icon name="fuel" />{{ t('fuel') }}</button>
        <button type="button" class="bf-btn bf-btn--secondary" @click="router.push({ path: '/car-event/new', query: { car: car.id } })"><Icon name="plus" />{{ t('addEvent').split(' ')[0] }}</button>
      </div>

      <section v-if="events.length">
        <div class="bf-list__head">{{ t('deadlines') }}</div>
        <div class="bf-list">
          <div v-for="e in events" :key="e.id" class="bf-row">
            <div class="bf-row__icon"><Icon :name="evIcon(e.kind)" /></div>
            <button type="button" class="bf-row__body" style="all: unset; flex: 1; min-width: 0; cursor: pointer;" @click="router.push('/car-event/' + e.id)">
              <div class="bf-row__title">{{ e.title }}</div><div class="bf-row__sub">{{ evSub(e) }}</div>
            </button>
            <button type="button" class="link" @click="done(e)">{{ t('markDone').split(',')[0] }}</button>
          </div>
        </div>
      </section>

      <section v-if="fuels.length">
        <div class="bf-list__head">{{ t('refuels') }}</div>
        <div class="bf-list"><TxRow v-for="x in fuels" :key="x.id" :tx="x" /></div>
      </section>
      <section v-if="services.length">
        <div class="bf-list__head">{{ t('serviceRepairs') }}</div>
        <div class="bf-list"><TxRow v-for="x in services" :key="x.id" :tx="x" /></div>
      </section>
      <button type="button" class="link" @click="router.push('/car-edit/new')">+ {{ t('newCar') }}</button>
    </template>
  </main>
</template>
